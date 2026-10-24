// Export as pack (#271): what can be exported and the files each chosen item contributes.
// User layers: userData/templates/injects/<type>/, userData/prompts/<name>.md (only names the
// app ships, the only prompts a pack may carry), userData/comfy/workflows/<id>.json with its
// <id>.bindings.json. From a project: its resolved domain profile saved under a new id and its
// documents, each with the license the author states.
import { promises as fs } from 'node:fs'
import { userInfo } from 'node:os'
import { extname, join } from 'node:path'
import { DomainProfile, builtinByKey, resolveProfile } from '@shared/domains'
import type {
  ExportableDocument,
  ExportableProject,
  PackExportDocument,
} from '@shared/ipc/pack-export'
import type { Project } from '@shared/schemas/project'
import {
  PACK_EXTENSIONS,
  PACK_ITEM_ID,
  SpdxExpression,
  type PackDocument,
  type PackProblem,
} from '@shared/schemas/pack'
import { slugify } from '../lib/fs'
import { userDataPath } from '../lib/paths'
import { documentFiles } from '../ingest/storage'
import { globalDir as promptsDir } from '../prompts/layers'
import { userTemplatesRoot } from '../render/templates'
import type { PackTree, Skipped } from './export-example'

const workflowsDir = (): string => userDataPath('comfy', 'workflows')
const BINDINGS = '.bindings.json'

async function readdirSafe(dir: string): Promise<string[]> {
  return (await fs.readdir(dir).catch(() => [] as string[])).sort()
}

async function readJsonSafe(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8')) as Record<string, unknown>
  } catch {
    return undefined
  }
}

// ---- sources ------------------------------------------------------------------------------

export async function userTemplateItems(): Promise<{ id: string; label: string }[]> {
  const out: { id: string; label: string }[] = []
  for (const type of await readdirSafe(userTemplatesRoot())) {
    if (!PACK_ITEM_ID.templates.test(type)) continue
    const meta = await readJsonSafe(join(userTemplatesRoot(), type, 'meta.json'))
    if (!meta) continue
    out.push({ id: type, label: typeof meta.label === 'string' ? meta.label : type })
  }
  return out
}

export async function userPromptItems(
  shipped: readonly string[],
): Promise<{ id: string; label: string }[]> {
  return (await readdirSafe(promptsDir()))
    .filter((n) => n.endsWith('.md'))
    .map((n) => n.slice(0, -3))
    .filter((name) => shipped.includes(name))
    .map((name) => ({ id: name, label: name }))
}

export async function userWorkflowItems(): Promise<{ id: string; label: string }[]> {
  const names = await readdirSafe(workflowsDir())
  const out: { id: string; label: string }[] = []
  for (const n of names) {
    if (!n.endsWith('.json') || n.endsWith(BINDINGS)) continue
    const id = n.slice(0, -5)
    if (!PACK_ITEM_ID.workflows.test(id) || !names.includes(`${id}${BINDINGS}`)) continue
    const sidecar = await readJsonSafe(join(workflowsDir(), `${id}${BINDINGS}`))
    out.push({ id, label: typeof sidecar?.name === 'string' ? sidecar.name : id })
  }
  return out
}

const docExt = (filename: string): string => extname(filename).toLowerCase()

function exportableDocument(d: Project['documents'][number]): ExportableDocument {
  const ext = docExt(d.filename)
  return {
    id: d.id,
    title: d.title,
    filename: d.filename,
    ...(d.license ? { license: d.license } : {}),
    ...(PACK_EXTENSIONS.documents.includes(ext)
      ? {}
      : { unsupported: `${ext || 'files without an extension'} cannot go into a pack` }),
  }
}

/** The project's resolved domain profile (snapshot, pack or built-in, with overrides). */
export const projectProfile = (p: Project): DomainProfile =>
  resolveProfile(p.orgType, p.domainProfileOverrides, p.domainProfileSnapshot)

export function exportableProject(path: string, p: Project, notice?: string): ExportableProject {
  const profile = projectProfile(p)
  const slug = slugify(p.name, 60).toLowerCase()
  return {
    path,
    name: p.name,
    domain: { id: profile.id, label: profile.label, builtin: !!builtinByKey(p.orgType) },
    documents: p.documents.map(exportableDocument),
    exampleSlug: PACK_ITEM_ID.examples.test(slug) ? slug : 'example',
    ...(notice ? { exampleNotice: notice } : {}),
  }
}

/** An id label for io.github.<user>.<name> from the OS user name. */
export function suggestedUser(name = safeUserName()): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s.slice(0, 39) || 'you'
}

function safeUserName(): string {
  try {
    return userInfo().username
  } catch {
    return ''
  }
}

// ---- collection -----------------------------------------------------------------------------

export interface Collected {
  files: PackTree
  documents: PackDocument[]
  skipped: Skipped[]
  problems: PackProblem[]
}

export const emptyCollected = (): Collected => ({
  files: new Map(),
  documents: [],
  skipped: [],
  problems: [],
})

async function walkFiles(dir: string, rel = ''): Promise<string[]> {
  const out: string[] = []
  for (const e of await fs.readdir(join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...(await walkFiles(dir, r)))
    else if (e.isFile()) out.push(r)
  }
  return out.sort()
}

export async function collectTemplates(types: readonly string[], out: Collected): Promise<void> {
  for (const type of types) {
    const dir = join(userTemplatesRoot(), type)
    const files = await walkFiles(dir).catch(() => undefined)
    if (!files) {
      out.problems.push({ path: `templates/${type}`, message: `No user template "${type}"` })
      continue
    }
    for (const rel of files) {
      if (rel.split('/').some((s) => s.startsWith('.'))) {
        out.skipped.push({ path: `templates/${type}/${rel}`, reason: 'hidden file' })
        continue
      }
      out.files.set(`templates/${type}/${rel}`, await fs.readFile(join(dir, rel)))
    }
  }
}

async function addFile(out: Collected, packPath: string, path: string, missing: string) {
  try {
    out.files.set(packPath, await fs.readFile(path))
  } catch {
    out.problems.push({ path: packPath, message: missing })
  }
}

export async function collectPrompts(names: readonly string[], out: Collected): Promise<void> {
  for (const name of names)
    await addFile(
      out,
      `prompts/${name}.md`,
      join(promptsDir(), `${name}.md`),
      `No global override of the prompt "${name}"`,
    )
}

export async function collectWorkflows(ids: readonly string[], out: Collected): Promise<void> {
  for (const id of ids) {
    await addFile(
      out,
      `workflows/${id}.json`,
      join(workflowsDir(), `${id}.json`),
      `No user workflow "${id}"`,
    )
    await addFile(
      out,
      `workflows/${id}${BINDINGS}`,
      join(workflowsDir(), `${id}${BINDINGS}`),
      `Workflow "${id}" has no bindings; open it on the Workflows screen and save its bindings`,
    )
  }
}

/** The project's resolved profile under a new id and label, with no aliases. */
export function collectDomain(p: Project, id: string, label: string, out: Collected): void {
  const profile = DomainProfile.parse({ ...projectProfile(p), id, label, aliases: [] })
  out.files.set(`domains/${id}.json`, Buffer.from(JSON.stringify(profile, null, 2) + '\n'))
}

/** A path segment from a file name: pack path characters only, extension kept lowercase. */
export function safeFileName(filename: string): string {
  const ext = docExt(filename)
  const stem = filename.slice(0, filename.length - ext.length)
  const s = stem
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9_.-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80)
  return `${s || 'document'}${ext}`
}

function uniqueSlug(title: string, taken: Set<string>): string {
  const base =
    slugify(title, 56)
      .toLowerCase()
      .replace(/^[^a-z0-9]+/, '') || 'document'
  let slug = base
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`
  taken.add(slug)
  return slug
}

function licenseProblem(d: { title: string }, license: string | undefined): string | undefined {
  if (!license?.trim())
    return `Document "${d.title}" has no license. Choose the license you may redistribute it under, or leave the document out.`
  if (!SpdxExpression.safeParse(license.trim()).success)
    return `Document "${d.title}": "${license}" is not an SPDX license expression (for example CC-BY-4.0 or LicenseRef-Custom).`
  return undefined
}

export async function collectDocuments(
  root: string,
  p: Project,
  chosen: readonly PackExportDocument[],
  out: Collected,
): Promise<void> {
  const taken = new Set<string>()
  for (const c of chosen) {
    const doc = p.documents.find((d) => d.id === c.documentId)
    if (!doc) {
      out.problems.push({ message: `The project has no document ${c.documentId}` })
      continue
    }
    const issue = exportableDocument(doc).unsupported ?? licenseProblem(doc, c.license)
    if (issue) {
      out.problems.push({
        path: doc.filename,
        message: issue.startsWith('Document') ? issue : `Document "${doc.title}": ${issue}`,
      })
      continue
    }
    const path = `documents/${uniqueSlug(c.title || doc.title, taken)}/${safeFileName(doc.filename)}`
    await addFile(
      out,
      path,
      documentFiles(root, doc).original,
      `The original file of "${doc.title}" is missing`,
    )
    out.documents.push({
      path,
      title: (c.title || doc.title).slice(0, 300),
      license: c.license!.trim(),
      ...(c.source ? { source: c.source } : {}),
    })
  }
}
