// Command lines for the reference documents (#325), bundled for plain Node by
// scripts/fetch-documents.mjs and scripts/build-library-packs.mjs (scripts/lib/bundle-main.mjs).
//
//   fetch-documents [--pin] [--repin <slug,…>] [--only <slug,…>] [--offline] [--cache <dir>]
//   build-library-packs [--only <pack,…>] [--out <dir>] [--cache <dir>] [--allow-missing]
//                       [--core] [--url <catalog base>]
//
// Exit code 0 when everything asked for succeeded, 1 otherwise.
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { DocumentsManifest } from './manifest'
import { applyPins, fetchDocuments, manualDownloadLines, type FetchResult } from './fetch'
import { buildLibraryPacks, syncCoreDocuments } from './library-build'

export interface DocumentsCliIo {
  out(line: string): void
  err(line: string): void
}

export interface DocumentsCliOptions {
  root: string
  appVersion: string
  today?: string
  fetchImpl?: typeof fetch
}

export const MANIFEST_PATH = ['packs', 'documents', 'manifest.json'] as const
export const DEFAULT_CACHE = ['.cache', 'documents'] as const

interface Flags {
  values: Map<string, string>
  bools: Set<string>
}

function parseFlags(argv: readonly string[], valued: readonly string[]): Flags | string {
  const values = new Map<string, string>()
  const bools = new Set<string>()
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (!a.startsWith('--')) return `Unexpected argument ${a}`
    if (valued.includes(a)) {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) return `${a} needs a value`
      values.set(a, v)
    } else bools.add(a)
  }
  return { values, bools }
}

const list = (v: string | undefined): string[] =>
  v
    ? v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : []

export async function loadManifest(root: string): Promise<DocumentsManifest> {
  const raw = JSON.parse(await fs.readFile(join(root, ...MANIFEST_PATH), 'utf8'))
  return DocumentsManifest.parse(raw)
}

async function saveManifest(root: string, m: DocumentsManifest): Promise<void> {
  // Keep the input shape (no defaults written back) so the file stays small and reviewable.
  const strip = <T extends Record<string, unknown>>(o: T): T =>
    Object.fromEntries(
      Object.entries(o).filter(([, v]) => !(Array.isArray(v) && v.length === 0) && v !== undefined),
    ) as T
  const out = { ...m, documents: m.documents.map(strip), links: m.links.map(strip) }
  const path = join(root, ...MANIFEST_PATH)
  await fs.writeFile(path, await formatJson(path)(`${JSON.stringify(out, null, 2)}\n`))
}

/** Prettier with the repo's config, so a rewritten JSON file stays as `pnpm format` writes it. */
const formatJson =
  (filepath: string) =>
  async (json: string): Promise<string> => {
    const prettier = await import('prettier')
    const config = (await prettier.resolveConfig(filepath)) ?? {}
    return prettier.format(json, { ...config, filepath, parser: 'json' })
  }

const FETCH_FLAGS = ['--repin', '--only', '--cache', '--concurrency']
const FETCH_SWITCHES = new Set(['--pin', '--offline'])

function summarize(results: readonly FetchResult[]): string {
  const counts: Record<string, number> = {}
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1
  return Object.entries(counts)
    .map(([k, n]) => `${n} ${k}`)
    .join(', ')
}

/** SEC asks scripted clients to declare who they are (sec.gov fair-access policy). */
function hostHeaders(): Record<string, Record<string, string>> {
  const contact = process.env.DOCUMENTS_CONTACT
  return contact
    ? { 'www.sec.gov': { 'User-Agent': `Action Stations documents fetcher ${contact}` } }
    : {}
}

export async function runFetchCli(
  argv: readonly string[],
  opts: DocumentsCliOptions,
  io: DocumentsCliIo,
): Promise<number> {
  const flags = parseFlags(argv, FETCH_FLAGS)
  if (typeof flags === 'string') return (io.err(flags), 1)
  const unknown = [...flags.bools].filter((b) => !FETCH_SWITCHES.has(b))
  if (unknown.length) return (io.err(`Unknown option ${unknown[0]}`), 1)
  const cacheDir = resolve(opts.root, flags.values.get('--cache') ?? join(...DEFAULT_CACHE))
  const manifest = await loadManifest(opts.root)
  const today = opts.today ?? new Date().toISOString().slice(0, 10)
  const results = await fetchDocuments(manifest, {
    cacheDir,
    only: list(flags.values.get('--only')),
    pin: flags.bools.has('--pin'),
    repin: list(flags.values.get('--repin')),
    offline: flags.bools.has('--offline'),
    concurrency: Number(flags.values.get('--concurrency') ?? 6),
    hostHeaders: hostHeaders(),
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    log: io.out,
    today,
  })
  if (results.some((r) => r.status === 'pinned'))
    await saveManifest(opts.root, applyPins(manifest, results, today))
  await fs.mkdir(cacheDir, { recursive: true })
  await fs.writeFile(join(cacheDir, 'fetch-report.json'), `${JSON.stringify(results, null, 2)}\n`)
  io.out(`fetch-documents: ${summarize(results)} (report: ${join(cacheDir, 'fetch-report.json')})`)
  const manual = manualDownloadLines(manifest, results, cacheDir)
  if (manual.length) {
    io.err('These need attention (download by hand into the cache, then run again):')
    for (const l of manual) io.err(`  ${l}`)
  }
  return results.every((r) => ['cached', 'fetched', 'pinned', 'inbox'].includes(r.status)) ? 0 : 1
}

const BUILD_FLAGS = ['--only', '--out', '--cache', '--url']
const BUILD_SWITCHES = new Set(['--allow-missing', '--core'])

export async function runBuildCli(
  argv: readonly string[],
  opts: DocumentsCliOptions,
  io: DocumentsCliIo,
): Promise<number> {
  const flags = parseFlags(argv, BUILD_FLAGS)
  if (typeof flags === 'string') return (io.err(flags), 1)
  const unknown = [...flags.bools].filter((b) => !BUILD_SWITCHES.has(b))
  if (unknown.length) return (io.err(`Unknown option ${unknown[0]}`), 1)
  const cacheDir = resolve(opts.root, flags.values.get('--cache') ?? join(...DEFAULT_CACHE))
  const manifest = await loadManifest(opts.root)
  if (flags.bools.has('--core')) {
    const core = await syncCoreDocuments(manifest, {
      root: opts.root,
      cacheDir,
      format: formatJson(join(opts.root, 'packs', 'bundled.json')),
    })
    for (const l of core.lines) io.out(l)
    for (const p of core.problems) io.err(`  ✖ ${p}`)
    return core.problems.length ? 1 : 0
  }
  const outDir = resolve(opts.root, flags.values.get('--out') ?? join('out', 'library-packs'))
  const result = await buildLibraryPacks(manifest, {
    cacheDir,
    outDir,
    appVersion: opts.appVersion,
    only: list(flags.values.get('--only')),
    allowMissing: flags.bools.has('--allow-missing'),
    catalogBaseUrl: flags.values.get('--url') ?? 'https://actionstations.ai/packs/files',
  })
  for (const p of result.packs)
    io.out(
      `  ${p.id}: ${p.documents} documents${p.missing.length ? ` (${p.missing.length} missing)` : ''}, ${p.files} files, ${mb(p.bytes)} uncompressed, ${mb(p.archiveBytes)} archive`,
    )
  for (const p of result.problems) io.err(`  ✖ ${p}`)
  io.out(`build-library-packs: ${result.packs.length} packs → ${outDir}`)
  return result.problems.length ? 1 : 0
}

const mb = (n: number): string => `${(n / 1_000_000).toFixed(1)} MB`
