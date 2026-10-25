// A project as a pack example (#271). The copy goes through the same filter as examples:open
// (no derived data, no example marker, no links) plus what a published example must not carry:
// provider ids and routing, key-like fields, absolute paths of this computer, index.sqlite and
// .cache. A text file that still looks like it holds a secret or an author path after
// scrubbing blocks the export (same patterns as scripts/make-example.mjs).
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { builtinByKey } from '@shared/domains'
import type { PackExportExample } from '@shared/ipc/pack-export'
import { classifyPackPath, packPathProblem, type PackProblem } from '@shared/schemas/pack'
import { isDerivedPath } from '../project/duplicate'
import { MARKER_FILE } from '../examples/open'
import { userDataDir } from '../lib/paths'

export type PackTree = Map<string, Buffer>
export interface Skipped {
  path: string
  reason: string
}

/**
 * Paths into a user's home or the per-user temp folder. Generic story paths (/tmp/x.py,
 * /home/ubuntu/.bash_history, /var/log/…) are what system-log injects carry (#347); a path
 * under one of the author's own folders (home, project, user data) is flagged by prefix.
 */
const AUTHOR_PATH =
  /(?:^|["'\s(=:])((?:\/Users\/|\/(?:private\/)?var\/folders\/|[A-Za-z]:\\+Users\\+(?!\\*Public\\))[^"'\s)]*)/g
const PATH_TOKEN = /(?:^|["'\s(=:])(\/[^"'\s)]+)/g
const SECRET_HINT = /\b(?:sk-[A-Za-z0-9]{8,}|api[_-]?key\s*[:=]|Bearer\s+[A-Za-z0-9._-]{16,})/g
/** JSON keys that name a provider or hold a credential: dropped from the copy. */
const DROP_KEY =
  /^(?:providerId|providerIds|providerRef|api[-_]?key|apikey|secret|token|password|authorization)$/i
const TEXT_EXT = /\.(?:json|md|txt|csv)$/i
/** Top-level project entries that never go into an example, besides derived data. */
const LEAVE_OUT: Record<string, string> = {
  [MARKER_FILE]: 'example marker of the source project',
  'packs.json': 'records of copies from other packs',
  exports: 'exports are rebuilt from the project',
  templates: 'project templates are not part of an example (export them as templates)',
}
export const EXAMPLE_GITIGNORE = 'index.sqlite\nindex.sqlite-*\n.cache/\n'

/** Author-machine paths or secret-looking strings in a text. */
export function findLeaks(text: string, roots: readonly string[] = [homedir()]): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(AUTHOR_PATH)) found.add(m[1]!)
  const mine = roots.filter((r) => r.length > 1).map((r) => r.replace(/\/+$/, ''))
  for (const m of text.matchAll(PATH_TOKEN))
    if (mine.some((r) => m[1] === r || m[1]!.startsWith(`${r}/`))) found.add(m[1]!)
  for (const m of text.matchAll(SECRET_HINT)) found.add(m[0])
  return [...found]
}

function scrubString(s: string, absolute: readonly string[]): string {
  let out = s
  for (const a of absolute) out = out.split(a).join('')
  return out.replace(/\/Users\/[^/\s"]+/g, '~').replace(/\/home\/[^/\s"]+/g, '~')
}

/** Strip provider ids, routing, credentials and absolute paths from a JSON value. */
export function scrubJson(value: unknown, absolute: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => scrubJson(v, absolute))
  if (typeof value === 'string') return scrubString(value, absolute)
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) {
    if (DROP_KEY.test(k)) continue
    if (k === 'providerRouting') out[k] = {}
    else if (k === 'provenance' && v && typeof v === 'object') out[k] = scrubProvenance(v, absolute)
    else out[k] = scrubJson(v, absolute)
  }
  return out
}

/** Media provenance names the provider instance that made it; keep only "template". */
function scrubProvenance(v: object, absolute: readonly string[]): unknown {
  const p = scrubJson(v, absolute) as Record<string, unknown>
  if (typeof p.provider === 'string' && p.provider !== 'template') p.provider = 'removed'
  return p
}

async function walk(root: string, rel = ''): Promise<{ rel: string; kind: 'file' | 'other' }[]> {
  const out: { rel: string; kind: 'file' | 'other' }[] = []
  const entries = await fs.readdir(join(root, rel), { withFileTypes: true })
  for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...(await walk(root, r)))
    else out.push({ rel: r, kind: e.isFile() ? 'file' : 'other' })
  }
  return out
}

/**
 * Why a project file stays out of the example: a reason to show, null to skip it without a
 * note (derived data, OS clutter, the .gitignore written fresh), undefined to include it.
 */
function leaveOutReason(
  rel: string,
  packPath: string,
  kind: 'file' | 'other',
): string | null | undefined {
  const top = rel.split('/')[0]!
  if (isDerivedPath(rel)) return null // derived: skipped without a note
  if (rel === '.gitignore') return null // written fresh
  if (LEAVE_OUT[top]) return LEAVE_OUT[top]!
  if (kind !== 'file') return 'not a regular file (links are never copied)'
  if (rel.split('/').some((s) => s === '.DS_Store' || s === 'Thumbs.db')) return null
  const unsafe = packPathProblem(packPath)
  if (unsafe) return unsafe
  const c = classifyPackPath(packPath)
  return 'error' in c ? c.error : undefined
}

export interface ExampleInput {
  root: string
  example: PackExportExample
  /** The new domain id when the project's domain is exported with the example. */
  domainId?: string
}

export interface ExampleOutput {
  files: PackTree
  skipped: Skipped[]
  problems: PackProblem[]
}

/** project.json for the example: the exported or built-in domain, no snapshot. */
function exampleProject(
  value: Record<string, unknown>,
  domainId: string | undefined,
  problems: PackProblem[],
): string | undefined {
  if (domainId) {
    value.orgType = domainId
    delete value.domainProfileOverrides
    delete value.domainProfileSnapshot
    return domainId
  }
  const builtin = builtinByKey(typeof value.orgType === 'string' ? value.orgType : undefined)
  if (!builtin && value.orgType !== undefined) {
    problems.push({
      path: 'project.json',
      message: `The project uses the domain "${String(value.orgType)}", which is not built in. Include the project's domain profile in the pack so the example opens without the pack it came from.`,
    })
    return undefined
  }
  delete value.domainProfileSnapshot
  return builtin?.id ?? 'generic'
}

async function fileBytes(path: string, rel: string, absolute: readonly string[]): Promise<Buffer> {
  const raw = await fs.readFile(path)
  if (!TEXT_EXT.test(rel)) return raw
  if (rel.toLowerCase().endsWith('.json')) {
    const value = scrubJson(JSON.parse(raw.toString('utf8')), absolute)
    return Buffer.from(JSON.stringify(value, null, 2) + '\n')
  }
  return Buffer.from(scrubString(raw.toString('utf8'), absolute))
}

function leakProblems(files: PackTree, roots: readonly string[]): PackProblem[] {
  const problems: PackProblem[] = []
  for (const [path, bytes] of files) {
    if (!TEXT_EXT.test(path)) continue
    const leaks = findLeaks(bytes.toString('utf8'), roots)
    if (leaks.length)
      problems.push({
        path,
        message: `looks like it holds a secret or a path on this computer (${leaks.join(', ')}). Remove it from the project and export again.`,
      })
  }
  return problems
}

/** Copy a project into examples/<slug>/ of a pack tree, with example.json. */
export async function collectExample(input: ExampleInput): Promise<ExampleOutput> {
  const { root, example } = input
  const base = `examples/${example.slug}`
  const absolute = [root, userDataDir(), homedir()].sort((a, b) => b.length - a.length)
  const files: PackTree = new Map()
  const skipped: Skipped[] = []
  const problems: PackProblem[] = []
  let domainProfile: string | undefined
  for (const { rel, kind } of await walk(root)) {
    const packPath = `${base}/project/${rel}`
    const reason = leaveOutReason(rel, packPath, kind)
    if (reason === null) continue
    if (reason) {
      skipped.push({ path: rel, reason })
      continue
    }
    try {
      if (rel === 'project.json') {
        const value = scrubJson(JSON.parse(await fs.readFile(join(root, rel), 'utf8')), absolute)
        domainProfile = exampleProject(value as Record<string, unknown>, input.domainId, problems)
        files.set(packPath, Buffer.from(JSON.stringify(value, null, 2) + '\n'))
      } else files.set(packPath, await fileBytes(join(root, rel), rel, absolute))
    } catch (e) {
      problems.push({ path: rel, message: `could not be read: ${(e as Error).message}` })
    }
  }
  files.set(`${base}/project/.gitignore`, Buffer.from(EXAMPLE_GITIGNORE))
  const manifest = {
    id: example.slug,
    title: example.title,
    domainProfile: domainProfile ?? 'generic',
    summary: example.summary,
    fictional: true,
    notice: example.notice,
    scenarios: [],
  }
  files.set(`${base}/example.json`, Buffer.from(JSON.stringify(manifest, null, 2) + '\n'))
  problems.push(...leakProblems(files, absolute))
  return { files, skipped, problems }
}
