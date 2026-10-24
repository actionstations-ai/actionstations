// Workflow store (#33, packs #264). Four layers, looked up project → global → pack → default:
//   default  <resources>/comfy/workflows/<id>.json + <id>.bindings.json (shipped, read-only;
//            edited bindings go to userData/comfy/overrides/<id>.bindings.json)
//   pack     workflows/<id>.json + <id>.bindings.json of an enabled pack (read-only; edited
//            bindings go to userData/comfy/overrides/packs/<packId>/<id>.bindings.json)
//   global   userData/comfy/workflows/
//   project  <project>/comfy/workflows/
// Per-media-type default workflow choice lives in userData/comfy/defaults.json; installing a
// pack never changes it, but the user can choose a pack workflow there.
// Copy-on-use (ADR-0018): workflowForRender copies a pack workflow (with the user's edited
// bindings, if any) into <project>/comfy/workflows/ and records it in <project>/packs.json, so
// the project keeps rendering after the pack is updated or uninstalled.
import { promises as fs } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { z } from 'zod'
import { MediaType, type WorkflowBinding, type WorkflowEntry } from '@shared/ipc/comfy'
import { AppError } from '../lib/errors'
import { exists, readJson, readJsonOr, safeJoin, slugify, writeJsonAtomic } from '../lib/fs'
import { resourcePath, userDataPath } from '../lib/paths'
import { customNodeClasses } from '../packs/comfy-core-nodes'
import {
  enabledItems,
  packById,
  packFilePath,
  packItemPath,
  type InstalledPack,
} from '../packs/layers'
import { copyPackItem, copyState, findCopy, forgetCopy } from '../packs/project-copies'
import { WorkflowSidecar } from './sidecar'
import type { ApiWorkflow } from './workflow'
import {
  literalInputs,
  missingNodes,
  parseApiWorkflow,
  requiredNodes,
  workflowSha256,
  type WorkflowInput,
} from './workflow'

export type WorkflowSource = WorkflowEntry['source']
type MediaTypeT = z.infer<typeof MediaType>

export interface LoadedWorkflow {
  entry: WorkflowEntry
  workflow: ApiWorkflow
  sidecar: WorkflowSidecar
}

const MAX_IMPORT_BYTES = 5 * 1024 * 1024
const BINDINGS_EXT = '.bindings.json'
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

export const BUILTIN_DEFAULTS: Partial<Record<MediaTypeT, string>> = {
  image: 'sdxl-photo',
  video: 'image-to-video',
}

const defaultDir = (): string => resourcePath('comfy', 'workflows')
const globalDir = (): string => userDataPath('comfy', 'workflows')
const overridesDir = (): string => userDataPath('comfy', 'overrides')
const defaultsFile = (): string => userDataPath('comfy', 'defaults.json')
const projectDir = (root: string): string => safeJoin(root, 'comfy', 'workflows')
/** Project-relative folder of project workflows (packs.json records POSIX paths). */
const PROJECT_REL_DIR = 'comfy/workflows'

function dirFor(source: Exclude<WorkflowSource, 'pack'>, projectRoot?: string): string {
  if (source === 'project') {
    if (!projectRoot) throw new AppError('VALIDATION', 'A project is required')
    return projectDir(projectRoot)
  }
  return source === 'global' ? globalDir() : defaultDir()
}

function assertId(id: string): void {
  if (!SAFE_ID.test(id)) throw new AppError('VALIDATION', `Invalid workflow id "${id}"`)
}

// ---- node availability (filled from /object_info by the comfy:status handler) ----------

let knownNodes: Set<string> | undefined

export function setAvailableNodes(nodes: Iterable<string>): void {
  knownNodes = new Set(nodes)
}

export function availableNodes(): Set<string> | undefined {
  return knownNodes
}

/** Tests only. */
export function resetStoreState(): void {
  knownNodes = undefined
}

// ---- layers --------------------------------------------------------------------------------

/** Where one workflow of one layer lives. `override` is the user's edited sidecar, if any. */
interface Located {
  source: WorkflowSource
  file: string
  sidecar: string
  override?: string
  pack?: InstalledPack
}

/** The enabled pack that provides workflow `id` (enabled packs never share an id). */
function packFor(id: string): InstalledPack | undefined {
  return enabledItems('workflows').find((i) => i.id === id)?.pack
}

const packOverridePath = (packId: string, id: string): string =>
  safeJoin(overridesDir(), 'packs', packId, `${id}${BINDINGS_EXT}`)

function locatePack(id: string): Located | undefined {
  const pack = packFor(id)
  if (!pack) return undefined
  return {
    source: 'pack',
    file: packItemPath(pack, 'workflows', id),
    sidecar: packFilePath(pack, `workflows/${id}${BINDINGS_EXT}`),
    override: packOverridePath(pack.id, id),
    pack,
  }
}

async function locate(
  id: string,
  source: WorkflowSource,
  projectRoot?: string,
): Promise<Located | undefined> {
  if (source === 'pack') return locatePack(id)
  const dir = dirFor(source, projectRoot)
  const file = join(dir, `${id}.json`)
  if (!(await exists(file))) return undefined
  return {
    source,
    file,
    sidecar: join(dir, `${id}${BINDINGS_EXT}`),
    ...(source === 'default' ? { override: join(overridesDir(), `${id}${BINDINGS_EXT}`) } : {}),
  }
}

const sourcesFor = (projectRoot?: string): WorkflowSource[] =>
  projectRoot ? ['project', 'global', 'pack', 'default'] : ['global', 'pack', 'default']

async function idsIn(dir: string): Promise<string[]> {
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    return []
  }
  return names
    .filter((n) => n.endsWith('.json') && !n.endsWith(BINDINGS_EXT))
    .map((n) => n.slice(0, -'.json'.length))
    .filter((id) => SAFE_ID.test(id))
    .sort()
}

async function idsOf(source: WorkflowSource, projectRoot?: string): Promise<string[]> {
  if (source === 'pack') return enabledItems('workflows').map((i) => i.id)
  return idsIn(dirFor(source, projectRoot))
}

// ---- reading -----------------------------------------------------------------------------

/** The sidecar in effect: the user's override (defaults and packs), else the layer's own. */
async function effectiveSidecarPath(loc: Located): Promise<string> {
  return loc.override && (await exists(loc.override)) ? loc.override : loc.sidecar
}

/** Pack provenance and copy state of a project copy of a pack workflow, if it is one. */
async function copyInfo(id: string, projectRoot: string): Promise<Partial<WorkflowEntry>> {
  const copy = await findCopy(projectRoot, 'workflows', id).catch(() => undefined)
  if (!copy) return {}
  const installed = packById(copy.packId)
  const provides = installed?.manifest.contents.workflows.includes(id) ? installed : undefined
  return {
    packId: copy.packId,
    packVersion: copy.version,
    ...(copy.packName ? { packName: copy.packName } : {}),
    copy: await copyState(projectRoot, copy, provides),
  }
}

function toEntry(
  id: string,
  source: WorkflowSource,
  workflow: ApiWorkflow,
  sidecar: WorkflowSidecar,
  extra: Partial<WorkflowEntry> = {},
): WorkflowEntry {
  const required = requiredNodes(workflow)
  const nodes = availableNodes()
  return {
    id,
    name: sidecar.name,
    mediaType: sidecar.mediaType,
    source,
    description: sidecar.description,
    bindings: sidecar.bindings,
    requiredNodes: required,
    ...(nodes ? { missingNodes: missingNodes(required, nodes) } : {}),
    customNodes: customNodeClasses(required),
    sha256: workflowSha256(workflow),
    ...extra,
  }
}

async function provenance(
  loc: Located,
  id: string,
  projectRoot?: string,
): Promise<Partial<WorkflowEntry>> {
  if (loc.pack)
    return { packId: loc.pack.id, packVersion: loc.pack.version, packName: loc.pack.name }
  if (loc.source === 'project' && projectRoot) return copyInfo(id, projectRoot)
  return {}
}

async function loadFrom(
  id: string,
  source: WorkflowSource,
  projectRoot?: string,
): Promise<LoadedWorkflow | undefined> {
  const loc = await locate(id, source, projectRoot)
  if (!loc) return undefined
  const workflow = await readWorkflowFile(loc.file)
  const sidecar = await readJson(await effectiveSidecarPath(loc), WorkflowSidecar)
  const extra = await provenance(loc, id, projectRoot)
  return { entry: toEntry(id, source, workflow, sidecar, extra), workflow, sidecar }
}

async function readWorkflowFile(path: string): Promise<ApiWorkflow> {
  return parseApiWorkflow(await fs.readFile(path, 'utf8'))
}

/** Resolve a workflow id: project, then global, then enabled packs, then the shipped defaults. */
export async function loadWorkflow(id: string, projectRoot?: string): Promise<LoadedWorkflow> {
  assertId(id)
  for (const source of sourcesFor(projectRoot)) {
    const found = await loadFrom(id, source, projectRoot)
    if (found) return found
  }
  throw new AppError('NOT_FOUND', `ComfyUI workflow "${id}" not found`)
}

/** Every workflow visible from here (shadowed ids appear once, with the winning source). */
export async function listWorkflows(projectRoot?: string): Promise<WorkflowEntry[]> {
  const seen = new Set<string>()
  const out: WorkflowEntry[] = []
  for (const source of sourcesFor(projectRoot)) {
    for (const id of await idsOf(source, projectRoot)) {
      if (seen.has(id)) continue
      seen.add(id)
      try {
        const loaded = await loadFrom(id, source, projectRoot)
        if (loaded) out.push(loaded.entry)
      } catch {
        // A broken user file must not hide the rest of the list.
      }
    }
  }
  return out.sort((a, b) => a.mediaType.localeCompare(b.mediaType) || a.name.localeCompare(b.name))
}

export async function workflowInputs(id: string, projectRoot?: string): Promise<WorkflowInput[]> {
  return literalInputs((await loadWorkflow(id, projectRoot)).workflow)
}

// ---- copy-on-use -------------------------------------------------------------------------

/**
 * Copy a pack workflow into the project (ADR-0018 § Uninstall): `<id>.json` and the bindings in
 * effect (the user's override, else the pack's sidecar) go to <project>/comfy/workflows/ and
 * are recorded in <project>/packs.json. Only called when the project has no `<id>.json`, so a
 * leftover record or sidecar of an earlier copy is replaced.
 */
async function copyPackWorkflow(id: string, projectRoot: string, loc: Located): Promise<void> {
  const pack = loc.pack!
  await copyPackItem(
    projectRoot,
    {
      pack: { id: pack.id, version: pack.version, name: pack.name },
      kind: 'workflows',
      id,
      files: [
        { from: loc.file, to: `${PROJECT_REL_DIR}/${id}.json` },
        { from: await effectiveSidecarPath(loc), to: `${PROJECT_REL_DIR}/${id}${BINDINGS_EXT}` },
      ],
    },
    { replaceEdited: true },
  )
}

/**
 * Resolve a workflow for rendering media. For a project, a workflow that resolves to a pack is
 * first copied into the project, so this and every later render use the project's copy.
 */
export async function workflowForRender(id: string, projectRoot?: string): Promise<LoadedWorkflow> {
  const loaded = await loadWorkflow(id, projectRoot)
  if (!projectRoot || loaded.entry.source !== 'pack') return loaded
  const loc = locatePack(id)
  if (!loc) return loaded
  await copyPackWorkflow(id, projectRoot, loc)
  return loadWorkflow(id, projectRoot)
}

// ---- writing -----------------------------------------------------------------------------

/** A new id that shadows nothing: not used in `dir`, by a shipped default or by an enabled pack. */
async function uniqueId(base: string, dir: string): Promise<string> {
  const stem = slugify(base, 60).toLowerCase() || 'workflow'
  for (let n = 1; ; n++) {
    const id = n === 1 ? stem : `${stem}-${n}`
    if (
      !(await exists(join(dir, `${id}.json`))) &&
      !(await exists(join(defaultDir(), `${id}.json`))) &&
      !packFor(id)
    )
      return id
  }
}

async function readImportFile(filePath: string): Promise<string> {
  if (extname(filePath).toLowerCase() !== '.json')
    throw new AppError('VALIDATION', 'Choose a .json workflow file')
  const stat = await fs.stat(filePath).catch(() => undefined)
  if (!stat?.isFile()) throw new AppError('NOT_FOUND', `File not found: ${filePath}`)
  if (stat.size > MAX_IMPORT_BYTES) throw new AppError('VALIDATION', 'Workflow file is too large')
  return fs.readFile(filePath, 'utf8')
}

export async function importWorkflow(input: {
  filePath: string
  name: string
  mediaType: MediaTypeT
  projectRoot?: string
}): Promise<WorkflowEntry> {
  const workflow = parseApiWorkflow(await readImportFile(input.filePath))
  const source: WorkflowSource = input.projectRoot ? 'project' : 'global'
  const dir = dirFor(source, input.projectRoot)
  const id = await uniqueId(input.name, dir)
  const sidecar = WorkflowSidecar.parse({
    name: input.name.trim() || id,
    mediaType: input.mediaType,
    description: `Imported from ${input.filePath.split(/[\\/]/).pop()}`,
    bindings: [],
  })
  await writeJsonAtomic(join(dir, `${id}.json`), workflow)
  await writeJsonAtomic(join(dir, `${id}${BINDINGS_EXT}`), sidecar)
  return toEntry(id, source, workflow, sidecar)
}

function assertBindingTargets(workflow: ApiWorkflow, bindings: WorkflowBinding[]): void {
  for (const b of bindings) {
    const [nodeId, , inputName] = b.target
    const node = workflow[nodeId]
    if (!node) throw new AppError('VALIDATION', `Binding targets unknown node "${nodeId}"`)
    if (!(inputName in node.inputs))
      throw new AppError(
        'VALIDATION',
        `Node ${nodeId} (${node.class_type}) has no input "${inputName}"`,
      )
  }
}

/**
 * Save edited bindings. Defaults and pack workflows are read-only: their bindings go to an
 * override in userData/comfy/overrides/ (packs under overrides/packs/<packId>/).
 */
export async function saveBindings(input: {
  id: string
  bindings: WorkflowBinding[]
  projectRoot?: string
}): Promise<WorkflowEntry> {
  const loaded = await loadWorkflow(input.id, input.projectRoot)
  assertBindingTargets(loaded.workflow, input.bindings)
  const sidecar = { ...loaded.sidecar, bindings: input.bindings }
  const { source } = loaded.entry
  const loc = await locate(input.id, source, input.projectRoot)
  if (!loc) throw new AppError('NOT_FOUND', `ComfyUI workflow "${input.id}" not found`)
  await writeJsonAtomic(loc.override ?? loc.sidecar, sidecar)
  const extra = await provenance(loc, input.id, input.projectRoot)
  return toEntry(input.id, source, loaded.workflow, sidecar, extra)
}

/**
 * Delete a user workflow. For a shipped default or a pack workflow this resets its edited
 * bindings (packs are removed on the Packs screen). Deleting a project copy of a pack workflow
 * also drops its record from <project>/packs.json.
 */
export async function deleteWorkflow(id: string, projectRoot?: string): Promise<void> {
  const { source } = (await loadWorkflow(id, projectRoot)).entry
  const loc = await locate(id, source, projectRoot)
  if (!loc) throw new AppError('NOT_FOUND', `ComfyUI workflow "${id}" not found`)
  if (loc.override) {
    if (!(await exists(loc.override)))
      throw new AppError(
        'VALIDATION',
        source === 'pack'
          ? 'Workflows from packs cannot be deleted; disable or uninstall the pack instead'
          : 'Built-in workflows cannot be deleted',
      )
    await fs.rm(loc.override, { force: true })
    return
  }
  await fs.rm(loc.file, { force: true })
  await fs.rm(loc.sidecar, { force: true })
  if (source === 'project' && projectRoot) await forgetCopy(projectRoot, 'workflows', id)
  // Keep a default that still resolves (a project copy deleted while the pack is installed).
  if (await loadWorkflow(id).catch(() => undefined)) return
  const defaults = await readUserDefaults()
  const kept = Object.fromEntries(Object.entries(defaults).filter(([, v]) => v !== id))
  if (Object.keys(kept).length !== Object.keys(defaults).length)
    await writeJsonAtomic(defaultsFile(), kept)
}

// ---- per-media-type defaults ---------------------------------------------------------------

const DefaultsFile = z.partialRecord(MediaType, z.string())
type Defaults = z.infer<typeof DefaultsFile>

async function readUserDefaults(): Promise<Defaults> {
  return readJsonOr(defaultsFile(), DefaultsFile, () => ({})).catch(() => ({}))
}

/** Effective defaults: user choices over the built-in ones. */
export async function getDefaults(): Promise<Defaults> {
  return { ...BUILTIN_DEFAULTS, ...(await readUserDefaults()) }
}

export async function setDefaults(next: Defaults, projectRoot?: string): Promise<Defaults> {
  for (const [mediaType, id] of Object.entries(next)) {
    if (!id) continue
    const loaded = await loadWorkflow(id, projectRoot)
    if (loaded.entry.mediaType !== mediaType)
      throw new AppError(
        'VALIDATION',
        `"${loaded.entry.name}" is a ${loaded.entry.mediaType} workflow, not ${mediaType}`,
      )
  }
  const merged = { ...(await readUserDefaults()), ...next }
  await writeJsonAtomic(defaultsFile(), DefaultsFile.parse(merged))
  return getDefaults()
}

export async function defaultWorkflowId(mediaType: MediaTypeT): Promise<string | undefined> {
  return (await getDefaults())[mediaType]
}

// ---- project discovery for adapter jobs ------------------------------------------------------

/** The project folder containing `path` (MediaJob.outDir lives inside one), if any. */
export async function projectRootFor(path: string): Promise<string | undefined> {
  let dir = path
  for (let i = 0; i < 12; i++) {
    if (await exists(join(dir, 'project.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
  return undefined
}
