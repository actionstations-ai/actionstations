// Assemble the bundled packs from the repo's folders (ADR-0020). One code path for the build
// (scripts/build-bundled-packs.mjs → bundled-build.ts, strict) and for unpackaged runs that
// read the repo in place (bundled.ts, lenient). Pure Node, no Electron.
//
// Where each kind lives (relative to `root`, the repo or a resources folder):
//   templates  templates/injects/<type>/        (__golden__/ and dotfiles left out)
//   prompts    prompts/<name>.md
//   workflows  comfy/workflows/<id>.json + <id>.bindings.json
//   domains    packs/domains/<id>.json
//   examples   examples/<slug>/                 (index.sqlite*, .cache/ and dotfiles left out,
//                                                except project/.gitignore)
//   documents  packs/documents/<pack>/<slug>/<file>   (<pack> = id without ai.actionstations.)
//   regulations packs/regulations/<id>.json             (#426; the pack is format 2 then)
//   frameworks packs/frameworks/<id>.json
//   README.md  packs/readmes/<pack>.md                 (optional; the pack's root README.md)
//
// Strict: every item on disk is mapped to exactly one pack, every mapped item exists, workflows
// are core-only, every readme names a mapped pack, and documents stay within the installer
// budget. Lenient (source mode): items
// the map does not mention that exist on disk (templates, prompts, workflows) join the core
// pack, and mapped items missing on disk are left out, so a test's resources folder with a
// few fixture templates still works.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import {
  PACK_KINDS,
  packFormatVersionFor,
  type PackContents,
  type PackDocument,
  type PackKind,
} from '@shared/schemas/pack'
import {
  BUNDLED_DOCUMENTS_MAX_BYTES,
  bundledShortName,
  specItems,
  type BundledMap,
  type BundledPackSpec,
} from './bundled-map'

/** One file of an assembled pack: its path in the pack and where it is on disk. */
export interface AssembledFile {
  path: string
  source: string
  size: number
}

/** pack.json without files[] (the build hashes them; source mode hashes on demand). */
export interface AssembledManifest {
  /** 2 when the pack carries regulations or frameworks, else 1 (packFormatVersionFor). */
  formatVersion: number
  id: string
  name: string
  version: string
  summary: string
  description: string
  author: BundledMap['author']
  license: string
  homepage?: string
  minAppVersion: string
  domains: string[]
  tags: string[]
  contents: PackContents
  documents: PackDocument[]
}

export interface AssembledPack {
  core: boolean
  manifest: AssembledManifest
  files: AssembledFile[]
}

export interface AssembleOptions {
  /** Folder holding templates/, prompts/, comfy/, examples/ and packs/. */
  root: string
  /** Pack version and minAppVersion: the app's version. */
  appVersion: string
  strict: boolean
}

export interface AssembleResult {
  packs: AssembledPack[]
  problems: string[]
}

const posix = (p: string): string => p.split(sep).join('/')

/** Files under `dir` (recursive), as POSIX paths relative to it, sorted. */
function walk(dir: string, skip: (rel: string, isDir: boolean) => boolean): string[] {
  const out: string[] = []
  const visit = (abs: string) => {
    for (const d of readdirSync(abs, { withFileTypes: true })) {
      const p = join(abs, d.name)
      const rel = posix(relative(dir, p))
      if (skip(rel, d.isDirectory())) continue
      if (d.isDirectory()) visit(p)
      else if (d.isFile()) out.push(rel)
    }
  }
  if (existsSync(dir)) visit(dir)
  return out.sort()
}

const isDot = (rel: string): boolean => rel.split('/').some((s) => s.startsWith('.'))

const skipTemplate = (rel: string): boolean =>
  isDot(rel) || rel === '__golden__' || rel.startsWith('__golden__/')

const skipExample = (rel: string, isDir: boolean): boolean => {
  const name = rel.slice(rel.lastIndexOf('/') + 1)
  if (rel === 'project/.gitignore' && !isDir) return false
  if (isDot(rel)) return true
  return !isDir && /^index\.sqlite/.test(name)
}

const listDirs = (dir: string, need: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter(
          (d) => d.isDirectory() && !d.name.startsWith('.') && existsSync(join(dir, d.name, need)),
        )
        .map((d) => d.name)
        .sort()
    : []

const listFiles = (dir: string, ext: string, not?: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((n) => n.endsWith(ext) && !(not && n.endsWith(not)) && !n.startsWith('.'))
        .map((n) => n.slice(0, -ext.length))
        .sort()
    : []

/** Items of each kind found on disk (documents: "<pack>/<slug>"). */
export function itemsOnDisk(root: string): Record<PackKind, string[]> {
  const docsRoot = join(root, 'packs', 'documents')
  const documents = existsSync(docsRoot)
    ? readdirSync(docsRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .flatMap((pack) =>
          readdirSync(join(docsRoot, pack.name), { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => `${pack.name}/${d.name}`),
        )
        .sort()
    : []
  return {
    templates: listDirs(join(root, 'templates', 'injects'), 'template.html'),
    prompts: listFiles(join(root, 'prompts'), '.md'),
    workflows: listFiles(join(root, 'comfy', 'workflows'), '.json', '.bindings.json'),
    domains: listFiles(join(root, 'packs', 'domains'), '.json'),
    examples: listDirs(join(root, 'examples'), 'example.json'),
    documents,
    regulations: listFiles(join(root, 'packs', 'regulations'), '.json'),
    frameworks: listFiles(join(root, 'packs', 'frameworks'), '.json'),
  }
}

/** The files of one item: [path in pack, absolute source path]. Empty when it is missing. */
function itemFiles(
  root: string,
  spec: BundledPackSpec,
  kind: PackKind,
  id: string,
): [string, string][] {
  const flat = (pairs: [string, string][]) => (pairs.every(([, s]) => existsSync(s)) ? pairs : [])
  switch (kind) {
    case 'templates': {
      const dir = join(root, 'templates', 'injects', id)
      if (!existsSync(join(dir, 'template.html'))) return []
      return walk(dir, skipTemplate).map((rel) => [`templates/${id}/${rel}`, join(dir, rel)])
    }
    case 'prompts':
      return flat([[`prompts/${id}.md`, join(root, 'prompts', `${id}.md`)]])
    case 'workflows': {
      const dir = join(root, 'comfy', 'workflows')
      return flat([
        [`workflows/${id}.json`, join(dir, `${id}.json`)],
        [`workflows/${id}.bindings.json`, join(dir, `${id}.bindings.json`)],
      ])
    }
    case 'domains':
      return flat([[`domains/${id}.json`, join(root, 'packs', 'domains', `${id}.json`)]])
    case 'examples': {
      const dir = join(root, 'examples', id)
      if (!existsSync(join(dir, 'example.json'))) return []
      return walk(dir, skipExample).map((rel) => [`examples/${id}/${rel}`, join(dir, rel)])
    }
    case 'documents': {
      const dir = join(root, 'packs', 'documents', bundledShortName(spec.id))
      return spec.documents
        .filter((d) => d.path.startsWith(`${id}/`))
        .map((d): [string, string] => [`documents/${d.path}`, join(dir, ...d.path.split('/'))])
        .filter(([, s]) => existsSync(s))
    }
    case 'regulations':
    case 'frameworks':
      return flat([[`${kind}/${id}.json`, join(root, 'packs', kind, `${id}.json`)]])
  }
}

/** packs/readmes/<pack short name>.md: a bundled pack's README.md (optional). */
export const readmePath = (root: string, id: string): string =>
  join(root, 'packs', 'readmes', `${bundledShortName(id)}.md`)

/** The readme files on disk, by pack short name. */
const readmesOnDisk = (root: string): string[] => listFiles(join(root, 'packs', 'readmes'), '.md')

const documentEntry = (d: BundledPackSpec['documents'][number]): PackDocument => ({
  path: `documents/${d.path}`,
  title: d.title,
  source: `${d.publisher}, ${d.url}`,
  license: d.license,
  ...(d.description ? { description: d.description } : {}),
})

function strictChecks(map: BundledMap, root: string, problems: string[]): void {
  const owners = new Map<string, string[]>()
  for (const spec of map.packs)
    for (const kind of PACK_KINDS)
      for (const id of specItems(spec, kind)) {
        const key =
          kind === 'documents' ? `documents ${bundledShortName(spec.id)}/${id}` : `${kind} ${id}`
        owners.set(key, [...(owners.get(key) ?? []), spec.id])
      }
  for (const [key, packs] of owners)
    if (packs.length > 1)
      problems.push(`${key} is mapped to more than one pack: ${packs.join(', ')}`)
  const disk = itemsOnDisk(root)
  for (const kind of PACK_KINDS)
    for (const id of disk[kind]) {
      const key = `${kind} ${id}`
      if (!owners.has(key))
        problems.push(`${key} is in the repo but mapped to no pack in packs/bundled.json`)
    }
  const shortNames = new Set(map.packs.map((p) => bundledShortName(p.id)))
  for (const name of readmesOnDisk(root))
    if (!shortNames.has(name))
      problems.push(`packs/readmes/${name}.md names no pack in packs/bundled.json`)
  for (const spec of map.packs) {
    if (!spec.core && spec.contents.workflows.length)
      problems.push(`${spec.id}: workflows belong in the core pack`)
    const docsDir = join(root, 'packs', 'documents', bundledShortName(spec.id))
    const described = new Set(spec.documents.map((d) => d.path))
    for (const d of spec.documents)
      if (!existsSync(join(docsDir, ...d.path.split('/'))))
        problems.push(`${spec.id}: document ${d.path} is missing`)
    for (const rel of walk(docsDir, (r) => isDot(r)))
      if (rel.includes('/') && !described.has(rel))
        problems.push(
          `${spec.id}: packs/documents/${bundledShortName(spec.id)}/${rel} has no documents[] entry`,
        )
  }
}

function packFor(
  spec: BundledPackSpec,
  map: BundledMap,
  opts: AssembleOptions,
  extra: Partial<Record<PackKind, string[]>>,
  problems: string[],
): AssembledPack | undefined {
  const contents = Object.fromEntries(PACK_KINDS.map((k) => [k, [] as string[]])) as PackContents
  const files: AssembledFile[] = []
  for (const kind of PACK_KINDS) {
    for (const id of [...specItems(spec, kind), ...(extra[kind] ?? [])]) {
      const pairs = itemFiles(opts.root, spec, kind, id)
      if (!pairs.length) {
        if (opts.strict) problems.push(`${spec.id}: ${kind} "${id}" is mapped but not in the repo`)
        continue
      }
      contents[kind].push(id)
      for (const [path, source] of pairs) files.push({ path, source, size: statSync(source).size })
    }
  }
  if (!files.length) return undefined
  const readme = readmePath(opts.root, spec.id)
  if (existsSync(readme))
    files.push({ path: 'README.md', source: readme, size: statSync(readme).size })
  const kept = new Set(contents.documents)
  return {
    core: spec.core,
    manifest: {
      formatVersion: packFormatVersionFor(contents),
      id: spec.id,
      name: spec.name,
      version: opts.appVersion,
      summary: spec.summary,
      description: spec.description,
      author: map.author,
      license: map.license,
      ...(map.homepage ? { homepage: map.homepage } : {}),
      minAppVersion: opts.appVersion,
      domains: spec.domains,
      tags: spec.tags,
      contents,
      documents: spec.documents
        .filter(
          (d) =>
            kept.has(d.path.split('/')[0]!) && files.some((f) => f.path === `documents/${d.path}`),
        )
        .map(documentEntry),
    },
    files: files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  }
}

/** Lenient mode: templates, prompts and workflows on disk that no pack lists join the core. */
function unmapped(map: BundledMap, root: string): Partial<Record<PackKind, string[]>> {
  const disk = itemsOnDisk(root)
  const out: Partial<Record<PackKind, string[]>> = {}
  for (const kind of ['templates', 'prompts', 'workflows'] as const) {
    const listed = new Set(map.packs.flatMap((p) => p.contents[kind]))
    out[kind] = disk[kind].filter((id) => !listed.has(id))
  }
  return out
}

/** Build every bundled pack's manifest (without hashes) and file list from the map. */
export function assembleBundledPacks(map: BundledMap, opts: AssembleOptions): AssembleResult {
  const problems: string[] = []
  if (opts.strict) strictChecks(map, opts.root, problems)
  const extra = opts.strict ? {} : unmapped(map, opts.root)
  const packs: AssembledPack[] = []
  for (const spec of map.packs) {
    const pack = packFor(spec, map, opts, spec.core ? extra : {}, problems)
    if (pack) packs.push(pack)
    else if (opts.strict) problems.push(`${spec.id}: the pack has no items`)
  }
  const docBytes = packs
    .flatMap((p) => p.files)
    .filter((f) => f.path.startsWith('documents/'))
    .reduce((n, f) => n + f.size, 0)
  if (docBytes > BUNDLED_DOCUMENTS_MAX_BYTES)
    problems.push(
      `Bundled documents total ${docBytes} bytes; the installer budget is ${BUNDLED_DOCUMENTS_MAX_BYTES} (move large documents to a catalog-only <domain>-library pack)`,
    )
  return { packs, problems }
}
