// Workflow store (#33). Three layers, looked up project → global → default:
//   default  <resources>/comfy/workflows/<id>.json + <id>.bindings.json (shipped, read-only;
//            edited bindings go to userData/comfy/overrides/<id>.bindings.json)
//   global   userData/comfy/workflows/
//   project  <project>/comfy/workflows/
// Per-media-type default workflow choice lives in userData/comfy/defaults.json.
import { promises as fs } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { z } from 'zod'
import { MediaType, type WorkflowBinding, type WorkflowEntry } from '@shared/ipc/comfy'
import { AppError } from '../lib/errors'
import { exists, readJson, readJsonOr, safeJoin, slugify, writeJsonAtomic } from '../lib/fs'
import { resourcePath, userDataPath } from '../lib/paths'
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

function dirFor(source: WorkflowSource, projectRoot?: string): string {
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

// ---- reading -----------------------------------------------------------------------------

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

async function readWorkflowFile(path: string): Promise<ApiWorkflow> {
  return parseApiWorkflow(await fs.readFile(path, 'utf8'))
}

async function readSidecar(id: string, source: WorkflowSource, dir: string) {
  if (source === 'default') {
    const override = join(overridesDir(), `${id}${BINDINGS_EXT}`)
    if (await exists(override)) return readJson(override, WorkflowSidecar)
  }
  return readJson(join(dir, `${id}${BINDINGS_EXT}`), WorkflowSidecar)
}

function toEntry(
  id: string,
  source: WorkflowSource,
  workflow: ApiWorkflow,
  sidecar: WorkflowSidecar,
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
    sha256: workflowSha256(workflow),
  }
}

async function loadFrom(
  id: string,
  source: WorkflowSource,
  projectRoot?: string,
): Promise<LoadedWorkflow | undefined> {
  const dir = dirFor(source, projectRoot)
  const file = join(dir, `${id}.json`)
  if (!(await exists(file))) return undefined
  const workflow = await readWorkflowFile(file)
  const sidecar = await readSidecar(id, source, dir)
  return { entry: toEntry(id, source, workflow, sidecar), workflow, sidecar }
}

/** Resolve a workflow id: project first, then global, then the shipped defaults. */
export async function loadWorkflow(id: string, projectRoot?: string): Promise<LoadedWorkflow> {
  assertId(id)
  const order: WorkflowSource[] = projectRoot
    ? ['project', 'global', 'default']
    : ['global', 'default']
  for (const source of order) {
    const found = await loadFrom(id, source, projectRoot)
    if (found) return found
  }
  throw new AppError('NOT_FOUND', `ComfyUI workflow "${id}" not found`)
}

/** Every workflow visible from here (shadowed ids appear once, with the winning source). */
export async function listWorkflows(projectRoot?: string): Promise<WorkflowEntry[]> {
  const sources: WorkflowSource[] = projectRoot
    ? ['project', 'global', 'default']
    : ['global', 'default']
  const seen = new Set<string>()
  const out: WorkflowEntry[] = []
  for (const source of sources) {
    for (const id of await idsIn(dirFor(source, projectRoot))) {
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

// ---- writing -----------------------------------------------------------------------------

async function uniqueId(base: string, dir: string): Promise<string> {
  const stem = slugify(base, 60).toLowerCase() || 'workflow'
  for (let n = 1; ; n++) {
    const id = n === 1 ? stem : `${stem}-${n}`
    if (
      !(await exists(join(dir, `${id}.json`))) &&
      !(await exists(join(defaultDir(), `${id}.json`)))
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

export async function saveBindings(input: {
  id: string
  bindings: WorkflowBinding[]
  projectRoot?: string
}): Promise<WorkflowEntry> {
  const loaded = await loadWorkflow(input.id, input.projectRoot)
  assertBindingTargets(loaded.workflow, input.bindings)
  const sidecar = { ...loaded.sidecar, bindings: input.bindings }
  const { source } = loaded.entry
  const path =
    source === 'default'
      ? join(overridesDir(), `${input.id}${BINDINGS_EXT}`)
      : join(dirFor(source, input.projectRoot), `${input.id}${BINDINGS_EXT}`)
  await writeJsonAtomic(path, sidecar)
  return toEntry(input.id, source, loaded.workflow, sidecar)
}

/** Delete a user workflow; for a shipped default this resets its edited bindings. */
export async function deleteWorkflow(id: string, projectRoot?: string): Promise<void> {
  const loaded = await loadWorkflow(id, projectRoot)
  const { source } = loaded.entry
  if (source === 'default') {
    const override = join(overridesDir(), `${id}${BINDINGS_EXT}`)
    if (!(await exists(override)))
      throw new AppError('VALIDATION', 'Built-in workflows cannot be deleted')
    await fs.rm(override, { force: true })
    return
  }
  const dir = dirFor(source, projectRoot)
  await fs.rm(join(dir, `${id}.json`), { force: true })
  await fs.rm(join(dir, `${id}${BINDINGS_EXT}`), { force: true })
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
