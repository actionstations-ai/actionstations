// Build the reference document packs (#325, ADR-0020) from the fetch cache:
//
//   buildLibraryPacks(manifest, opts)  one ai.actionstations.<domain>-library .aspack per
//                                      library: documents, pack.json and a README that lists
//                                      every document and the link-only references
//   syncCoreDocuments(manifest, opts)  the core pack's documents into packs/documents/core/
//                                      plus the core entry's documents[] in packs/bundled.json
//
// Every cached file is checked against its pinned sha256 before use. The archives are written
// with the export path's deterministic zip (archive.ts zipTree) and validated with readPack,
// the reader the app installs with, before anything is written.
//
// A user-supplied document (`supply: 'user'`, #1101) is never put in a pack, even when it is in
// the cache: pack.json lists it under userDocuments (title, publisher, landing page, sha256,
// size and how to get it), the README names it, and the pack license leaves it out. Each user
// downloads their own copy and adds it in the app.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import {
  manifestContents,
  PACK_LIMITS,
  PACK_MANIFEST_FILE,
  packArchiveName,
  type PackCatalogEntry,
  type PackDocument,
  type PackUserDocument,
} from '@shared/schemas/pack'
import { BUNDLED_DOCUMENTS_MAX_BYTES, BUNDLED_MAP, CORE_PACK_ID } from '../bundled-map'
import { catalogEntry } from '../cli'
import { packMinAppVersion, zipTree } from '../archive'
import { readPack } from '../reader'
import {
  cachePath,
  documentPackId,
  documentsOf,
  isUserSupplied,
  libraryPacks,
  linksOf,
  type DocumentPackName,
  type DocumentsManifest,
  type ManifestDocument,
  type ManifestLink,
} from './manifest'
import { processDocument, type PackedFile } from './process'

const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex')
const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export const LIBRARY_LICENSE = 'LicenseRef-US-Government-Work'

const PUBLISHER_TERMS = 'LicenseRef-Publisher-Terms'

/** The pack license: its documents' licenses joined with AND (US government work if empty). */
export function libraryLicense(docs: readonly Pick<ManifestDocument, 'license'>[]): string {
  const all = [...new Set(docs.map((d) => d.license))].sort(byPath)
  return all.length ? all.join(' AND ') : LIBRARY_LICENSE
}

const allFederal = (docs: readonly Pick<ManifestDocument, 'license'>[]): boolean =>
  !docs.some((d) => d.license === PUBLISHER_TERMS)

const FEDERAL_NOTE =
  'Every document here is a work of the United States federal government (17 U.S.C. §105) and is in the public domain in the United States.'
const MIXED_NOTE =
  "Documents marked LicenseRef-US-Government-Work are works of the United States federal government (17 U.S.C. §105). Documents marked LicenseRef-Publisher-Terms are published under their publisher's own terms, which the document and its entry in pack.json state."

/** One document's files for a pack, or why it is missing. */
interface Loaded {
  doc: ManifestDocument
  files: PackedFile[]
  skipped: { name: string; reason: string }[]
  notes: string[]
}

type LoadResult = { ok: Loaded } | { missing: string } | { problem: string }

/** Read a document from the cache, verify its pinned hash, and process it. */
export async function loadDocument(doc: ManifestDocument, cacheDir: string): Promise<LoadResult> {
  if (!doc.sha256) return { missing: 'not pinned yet' }
  const path = join(cacheDir, ...cachePath(doc).split('/'))
  const bytes = await fs.readFile(path).catch(() => undefined)
  if (!bytes) return { missing: `not in the cache (${path})` }
  if (sha256(bytes) !== doc.sha256)
    return {
      problem: `${doc.slug}: ${path} does not match the pinned sha256; run scripts/fetch-documents.mjs`,
    }
  const p = await processDocument(doc, bytes)
  return { ok: { doc, ...p } }
}

const mdEscape = (s: string): string => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

function documentRows(loaded: readonly Loaded[]): string[] {
  const rows = ['| Document | Publisher | Edition | Source |', '| --- | --- | --- | --- |']
  for (const l of loaded) {
    const d = l.doc
    rows.push(
      `| ${mdEscape(d.title)} | ${mdEscape(d.publisher)} | ${mdEscape(d.edition)} | <${d.url}> |`,
    )
  }
  return rows
}

function linkRows(links: readonly ManifestLink[]): string[] {
  const rows = [
    '| Reference | Publisher | Link | Why it is not in the pack |',
    '| --- | --- | --- | --- |',
  ]
  for (const l of links)
    rows.push(
      `| ${mdEscape(l.title)} | ${mdEscape(l.publisher)} | <${l.url}> | ${mdEscape(l.reason)} |`,
    )
  return rows
}

function userRows(docs: readonly ManifestDocument[]): string[] {
  const rows = ['| Document | Publisher | Edition | Where to get it |', '| --- | --- | --- | --- |']
  for (const d of docs)
    rows.push(
      `| ${mdEscape(d.title)} | ${mdEscape(d.publisher)} | ${mdEscape(d.edition)} | <${d.landing ?? d.url}> ${mdEscape(d.getIt ?? '')} |`,
    )
  return rows
}

const USER_NOTE =
  "Their publishers' terms do not allow them to be passed on, so the pack lists them without the file. Download your own copy from the publisher, then add it in Action Stations (Documents, Add from pack, Add the file…): the app checks it against the pinned sha256 and size and keeps it on this computer only."

/** The pack README: every document with publisher, date and source, then the links. */
export function libraryReadme(
  title: string,
  summary: string,
  loaded: readonly Loaded[],
  links: readonly ManifestLink[],
  users: readonly ManifestDocument[] = [],
): string {
  const notes = loaded.flatMap((l) => [
    ...l.notes.filter((n) => n.startsWith('cover photo')).map((n) => `${l.doc.title}: ${n}.`),
    ...(l.doc.note ? [`${l.doc.title}: ${l.doc.note}`] : []),
    ...l.skipped.map((s) => `${l.doc.title}: ${s.name} left out (${s.reason}).`),
  ])
  return [
    `# ${title}`,
    '',
    summary,
    '',
    `${allFederal(loaded.map((l) => l.doc)) ? FEDERAL_NOTE : MIXED_NOTE} Each entry in pack.json names its publisher and source URL. The documents are reference material: they name real agencies, and some name real companies or places, which exercises should use as background only, never as the exercising organization.`,
    '',
    `## Documents (${loaded.length})`,
    '',
    ...documentRows(loaded),
    '',
    ...(notes.length ? ['### Notes', '', ...notes.map((n) => `- ${n}`), ''] : []),
    ...(users.length
      ? [`## Add your own copy (${users.length})`, '', USER_NOTE, '', ...userRows(users), '']
      : []),
    `## Related references (links only, ${links.length})`,
    '',
    'Not in the pack: each reference states why (no fixed file to download, a web page, tool, database or service, sold or behind a login, or too large). Follow the link for the current version.',
    '',
    ...linkRows(links),
    '',
  ].join('\n')
}

function packDocuments(loaded: readonly Loaded[]): {
  entries: Map<string, Buffer>
  docs: PackDocument[]
} {
  const entries = new Map<string, Buffer>()
  const docs: PackDocument[] = []
  for (const l of loaded)
    for (const f of l.files) {
      const path = `documents/${l.doc.slug}/${f.name}`
      entries.set(path, f.bytes)
      docs.push({
        path,
        title: f.title.slice(0, 300),
        source: `${l.doc.publisher}, ${l.doc.url}`.slice(0, 500),
        license: l.doc.license,
        description: describe(l.doc).slice(0, 2000),
      })
    }
  return { entries, docs }
}

/** pack.json userDocuments[]: listed by hash, the file is not in the pack. */
const userDocuments = (docs: readonly ManifestDocument[]): PackUserDocument[] =>
  docs
    .map((d) => ({
      path: `documents/${d.slug}/${d.file}`,
      title: d.title.slice(0, 300),
      source: `${d.publisher}, ${d.landing ?? d.url}`.slice(0, 500),
      license: d.license,
      description: describe(d).slice(0, 2000),
      landing: d.landing ?? d.url,
      getIt: d.getIt!,
      sha256: d.sha256!,
      size: d.size!,
    }))
    .sort((a, b) => byPath(a.path, b.path))

const describe = (d: ManifestDocument): string =>
  [`Edition: ${d.edition}.`, d.basis.endsWith('.') ? d.basis : `${d.basis}.`, d.note ?? '']
    .filter(Boolean)
    .join(' ')

export interface LibraryBuildOptions {
  cacheDir: string
  outDir: string
  appVersion: string
  only?: readonly string[]
  allowMissing?: boolean
  catalogBaseUrl?: string
}

export interface BuiltLibrary {
  id: string
  version: string
  file: string
  documents: number
  /** Slugs of the user-supplied documents listed without their file. */
  userSupplied: string[]
  missing: string[]
  files: number
  bytes: number
  archiveBytes: number
  sha256: string
}

export interface LibraryBuildResult {
  packs: BuiltLibrary[]
  problems: string[]
}

interface Assembled {
  pack: DocumentPackName
  loaded: Loaded[]
  users: ManifestDocument[]
  missing: { doc: ManifestDocument; why: string }[]
  problems: string[]
}

async function assemble(
  m: DocumentsManifest,
  pack: DocumentPackName,
  cacheDir: string,
): Promise<Assembled> {
  const out: Assembled = { pack, loaded: [], users: [], missing: [], problems: [] }
  for (const doc of documentsOf(m, pack)) {
    if (isUserSupplied(doc)) {
      out.users.push(doc)
      continue
    }
    const r = await loadDocument(doc, cacheDir)
    if ('ok' in r) out.loaded.push(r.ok)
    else if ('missing' in r) out.missing.push({ doc, why: r.missing })
    else out.problems.push(r.problem)
  }
  return out
}

/** pack.json for a library, keys in the export path's order. */
function libraryManifest(
  m: DocumentsManifest,
  pack: DocumentPackName,
  docs: PackDocument[],
  users: readonly ManifestDocument[],
  files: ReadonlyMap<string, Buffer>,
  appVersion: string,
): Buffer {
  const info = m.libraries[pack]!
  const loadedDocs = docs.map((d) => ({ license: d.license as ManifestDocument['license'] }))
  const manifest = {
    formatVersion: 1,
    id: documentPackId(pack),
    name: info.name,
    version: info.version,
    summary: info.summary,
    description: `${allFederal(loadedDocs) ? 'Public-domain reference documents (US federal works)' : "Reference documents (US federal works and documents under their publishers' terms)"} for this domain, pinned by sha256. Catalog-only: not included with the app. The README lists every document with its publisher, date and source, and the related references that are links only.${users.length ? ' Documents whose publishers do not allow passing them on are listed without their file: each user downloads their own copy and adds it in the app, which checks it against the pinned sha256.' : ''}`,
    author: BUNDLED_MAP.author,
    license: libraryLicense(loadedDocs),
    ...(BUNDLED_MAP.homepage ? { homepage: BUNDLED_MAP.homepage } : {}),
    minAppVersion: packMinAppVersion(appVersion),
    domains: [info.domain],
    tags: ['library', 'documents'],
    contents: manifestContents({
      documents: [...new Set(docs.map((d) => d.path.split('/')[1]!))].sort(byPath),
    }),
    documents: [...docs].sort((a, b) => byPath(a.path, b.path)),
    ...(users.length ? { userDocuments: userDocuments(users) } : {}),
    files: [...files.keys()].sort(byPath).map((path) => {
      const b = files.get(path)!
      return { path, sha256: sha256(b), size: b.length }
    }),
  }
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
}

const EMPTY_BUILTINS = { templates: [], prompts: [], workflows: [], examples: [] }

async function buildOne(
  m: DocumentsManifest,
  a: Assembled,
  opts: LibraryBuildOptions,
): Promise<
  { built: BuiltLibrary; buffer: Buffer; entry: PackCatalogEntry } | { problems: string[] }
> {
  const info = m.libraries[a.pack]!
  const links = [
    ...a.missing.map((x) => ({
      pack: a.pack,
      title: x.doc.title,
      publisher: x.doc.publisher,
      url: x.doc.url,
      reason: `Not in this build (${x.why}); download it from the link`,
    })),
    ...linksOf(m, a.pack),
  ]
  const { entries, docs } = packDocuments(a.loaded)
  entries.set(
    'README.md',
    Buffer.from(libraryReadme(info.name, info.summary, a.loaded, links, a.users)),
  )
  const files = new Map(entries)
  entries.set(PACK_MANIFEST_FILE, libraryManifest(m, a.pack, docs, a.users, files, opts.appVersion))
  const buffer = await zipTree(entries)
  const read = await readPack(
    { buffer },
    { appVersion: packMinAppVersion(opts.appVersion), builtins: EMPTY_BUILTINS },
  )
  if (!read.ok)
    return {
      problems: read.problems.map(
        (p) => `${documentPackId(a.pack)}: ${p.path ? `${p.path}: ` : ''}${p.message}`,
      ),
    }
  const id = documentPackId(a.pack)
  const pinned =
    a.loaded
      .map((l) => l.doc.pinned ?? '')
      .sort()
      .at(-1) || '2026-01-01'
  return {
    buffer,
    entry: catalogEntry(
      read.pack,
      buffer.length,
      opts.catalogBaseUrl ?? 'https://actionstations.ai/packs/files',
      `${pinned}T00:00:00Z`,
    ),
    built: {
      id,
      version: info.version,
      file: packArchiveName(id, info.version),
      documents: a.loaded.length,
      userSupplied: a.users.map((d) => d.slug),
      missing: a.missing.map((x) => x.doc.slug),
      files: files.size,
      bytes: [...files.values()].reduce((n, b) => n + b.length, 0),
      archiveBytes: buffer.length,
      sha256: read.pack.archiveSha256,
    },
  }
}

/** Build, validate and write every library pack (or `only` these). */
export async function buildLibraryPacks(
  m: DocumentsManifest,
  opts: LibraryBuildOptions,
): Promise<LibraryBuildResult> {
  const wanted = libraryPacks(m).filter((p) => !opts.only?.length || opts.only.includes(p))
  const result: LibraryBuildResult = { packs: [], problems: [] }
  const entries: PackCatalogEntry[] = []
  await fs.mkdir(opts.outDir, { recursive: true })
  for (const pack of wanted) {
    const a = await assemble(m, pack, opts.cacheDir)
    result.problems.push(...a.problems)
    if (a.missing.length && !opts.allowMissing)
      result.problems.push(
        ...a.missing.map(
          (x) =>
            `${documentPackId(pack)}: ${x.doc.slug} ${x.why} (fetch it, or pass --allow-missing)`,
        ),
      )
    if (a.problems.length || (a.missing.length && !opts.allowMissing)) continue
    const b = await buildOne(m, a, opts)
    if ('problems' in b) {
      result.problems.push(...b.problems)
      continue
    }
    if (b.buffer.length > PACK_LIMITS.maxArchiveBytes)
      result.problems.push(
        `${b.built.id}: archive is ${b.buffer.length} bytes, over the ${PACK_LIMITS.maxArchiveBytes} limit`,
      )
    await fs.writeFile(join(opts.outDir, b.built.file), b.buffer)
    result.packs.push(b.built)
    entries.push(b.entry)
  }
  await fs.writeFile(
    join(opts.outDir, 'catalog-entries.json'),
    `${JSON.stringify(entries, null, 2)}\n`,
  )
  return result
}

// ---- core ---------------------------------------------------------------------------------

export interface CoreSyncOptions {
  root: string
  cacheDir: string
  /** Formats packs/bundled.json after writing (the CLI passes prettier). */
  format?: (json: string) => Promise<string>
}

/** The core pack's documents[] entries for packs/bundled.json. */
function bundledEntries(loaded: readonly Loaded[]): Record<string, unknown>[] {
  return loaded.flatMap((l) =>
    l.files.map((f) => ({
      path: `${l.doc.slug}/${f.name}`,
      title: f.title.slice(0, 300),
      license: l.doc.license,
      publisher: l.doc.publisher,
      url: l.doc.url,
      description: describe(l.doc).slice(0, 2000),
    })),
  )
}

/** Copy the core documents into packs/documents/core/ and list them in packs/bundled.json. */
export async function syncCoreDocuments(
  m: DocumentsManifest,
  opts: CoreSyncOptions,
): Promise<{ lines: string[]; problems: string[] }> {
  const a = await assemble(m, 'core', opts.cacheDir)
  const problems = [...a.problems, ...a.missing.map((x) => `core: ${x.doc.slug} ${x.why}`)]
  if (problems.length) return { lines: [], problems }
  const dir = join(opts.root, 'packs', 'documents', 'core')
  await fs.rm(dir, { recursive: true, force: true })
  let bytes = 0
  for (const l of a.loaded)
    for (const f of l.files) {
      await fs.mkdir(join(dir, l.doc.slug), { recursive: true })
      await fs.writeFile(join(dir, l.doc.slug, f.name), f.bytes)
      bytes += f.bytes.length
    }
  const mapPath = join(opts.root, 'packs', 'bundled.json')
  const map = JSON.parse(await fs.readFile(mapPath, 'utf8')) as {
    packs: { id: string; documents?: unknown }[]
  }
  const core = map.packs.find((p) => p.id === CORE_PACK_ID)
  if (!core) return { lines: [], problems: [`${mapPath} has no ${CORE_PACK_ID} entry`] }
  core.documents = bundledEntries(a.loaded)
  let text = `${JSON.stringify(map, null, 2)}\n`
  if (opts.format) text = await opts.format(text)
  await fs.writeFile(mapPath, text)
  const files = a.loaded.reduce((n, l) => n + l.files.length, 0)
  const lines = [
    `core: ${a.loaded.length} documents, ${files} files, ${(bytes / 1_000_000).toFixed(1)} MB → packs/documents/core/`,
    `core: ${((bytes / BUNDLED_DOCUMENTS_MAX_BYTES) * 100).toFixed(0)}% of the ${BUNDLED_DOCUMENTS_MAX_BYTES / 1024 / 1024} MiB installer budget for bundled documents`,
    ...a.loaded.flatMap((l) =>
      l.skipped.map((s) => `core: ${l.doc.slug}: ${s.name} left out (${s.reason})`),
    ),
    ...a.loaded.flatMap((l) => l.notes.map((n) => `core: ${l.doc.slug}: ${n}`)),
  ]
  return { lines, problems: [] }
}
