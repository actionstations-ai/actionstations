// Fetch the manifest's documents into the cache (#325), run by scripts/fetch-documents.mjs.
// Not part of the app: the only network calls are to the URLs in packs/documents/manifest.json.
//
// Each document is downloaded with browser-like headers (several agency sites answer plain
// requests with 403 or a bot page; fema.gov wants `Range: bytes=0-`), checked to be the file
// type its name says rather than an HTML page, and hashed. A file whose sha256 differs from the
// manifest is refused and never written to the cache. Files the owner downloads by hand go in
// `<cache>/inbox/` under any name; a file there whose sha256 matches a document is moved into
// place. With `pin`, documents that have no hash yet (or are named in `repin`) take the fetched
// file's sha256 and size, and the caller writes the manifest back.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { cachePath, type DocumentsManifest, type ManifestDocument } from './manifest'

export const BROWSER_HEADERS: Readonly<Record<string, string>> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Range: 'bytes=0-',
}

export type FetchStatus =
  | 'cached' // already in the cache with the pinned hash
  | 'fetched' // downloaded, hash matches
  | 'pinned' // downloaded and its hash recorded (pin mode)
  | 'inbox' // taken from <cache>/inbox
  | 'mismatch' // downloaded, hash differs: refused
  | 'unpinned' // no hash in the manifest and pin mode is off: not written
  | 'failed' // every URL failed

export interface FetchResult {
  slug: string
  status: FetchStatus
  /** sha256/size of the bytes that were seen (fetched or found). */
  sha256?: string
  size?: number
  /** Which URL served it. */
  from?: string
  /** One line per URL tried, for the report. */
  errors: string[]
}

export interface FetchOptions {
  cacheDir: string
  /** Only these slugs (default: all). */
  only?: readonly string[]
  /** Record hashes for unpinned documents (and the slugs in `repin`). */
  pin?: boolean
  repin?: readonly string[]
  /** Skip the network: report what is cached or in the inbox. */
  offline?: boolean
  fetchImpl?: typeof fetch
  /** Extra headers per host (SEC wants a declared User-Agent with a contact). */
  hostHeaders?: Readonly<Record<string, Record<string, string>>>
  concurrency?: number
  timeoutMs?: number
  /** Retries after 429/502/503/504 (default 3), waiting Retry-After or base × attempt. */
  retries?: number
  retryBaseMs?: number
  log?: (line: string) => void
  /** Today (YYYY-MM-DD) for `pinned`. */
  today?: string
}

const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex')

/** Whether the bytes look like the file type the name says (not an HTML error page). */
export function sniffProblem(file: string, bytes: Buffer, contentType = ''): string | undefined {
  if (bytes.length === 0) return 'empty response'
  const head = bytes.subarray(0, 512).toString('latin1').trimStart().toLowerCase()
  if (
    head.startsWith('<!doctype html') ||
    head.startsWith('<html') ||
    /text\/html/i.test(contentType)
  )
    return 'served an HTML page (bot check or error page), not the file'
  const ext = file.slice(file.lastIndexOf('.') + 1)
  if (ext === 'pdf' && !bytes.subarray(0, 1024).toString('latin1').includes('%PDF-'))
    return 'not a PDF'
  if (['docx', 'pptx', 'xlsx', 'zip'].includes(ext) && bytes.readUInt32LE(0) !== 0x04034b50)
    return `not a .${ext} (zip) file`
  return undefined
}

const RETRY_STATUS = new Set([429, 502, 503, 504])

/** Wait before retry `attempt` (1-based): Retry-After when the server sends seconds. */
function retryDelayMs(res: Response, attempt: number, base: number): number {
  const after = Number(res.headers.get('retry-after'))
  return Number.isFinite(after) && after > 0 ? Math.min(after, 120) * 1000 : base * attempt
}

async function download(
  url: string,
  doc: ManifestDocument,
  opts: FetchOptions,
): Promise<{ bytes: Buffer } | { error: string }> {
  const doFetch = opts.fetchImpl ?? fetch
  const host = new URL(url).host
  const headers = { ...BROWSER_HEADERS, ...(opts.hostHeaders?.[host] ?? {}) }
  try {
    let res: Response
    for (let attempt = 1; ; attempt++) {
      const signal = AbortSignal.timeout(opts.timeoutMs ?? 180_000)
      res = await doFetch(url, { headers, redirect: 'follow', signal })
      if (!RETRY_STATUS.has(res.status) || attempt > (opts.retries ?? 3)) break
      await res.arrayBuffer().catch(() => undefined)
      await new Promise((r) =>
        setTimeout(r, retryDelayMs(res, attempt, opts.retryBaseMs ?? 10_000)),
      )
    }
    if (res.status !== 200 && res.status !== 206) return { error: `HTTP ${res.status}` }
    const range = res.headers.get('content-range')
    const bytes = Buffer.from(await res.arrayBuffer())
    if (res.status === 206 && range) {
      const m = /^bytes 0-(\d+)\/(\d+)$/.exec(range)
      if (!m || Number(m[1]) + 1 !== Number(m[2]) || bytes.length !== Number(m[2]))
        return { error: `partial content (${range})` }
    }
    const problem = sniffProblem(doc.file, bytes, res.headers.get('content-type') ?? '')
    return problem ? { error: problem } : { bytes }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

async function readIf(path: string): Promise<Buffer | undefined> {
  return fs.readFile(path).catch(() => undefined)
}

async function writeAtomic(path: string, bytes: Buffer): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.part`
  await fs.writeFile(tmp, bytes)
  await fs.rename(tmp, path)
}

/** sha256 → path of every file in <cache>/inbox. */
async function scanInbox(cacheDir: string): Promise<Map<string, string>> {
  const dir = join(cacheDir, 'inbox')
  const out = new Map<string, string>()
  const names = await fs.readdir(dir).catch(() => [] as string[])
  for (const name of names) {
    const p = join(dir, name)
    const st = await fs.stat(p).catch(() => null)
    if (st?.isFile()) out.set(sha256(await fs.readFile(p)), p)
  }
  return out
}

function accept(
  doc: ManifestDocument,
  bytes: Buffer,
  opts: FetchOptions,
): { status: FetchStatus; write: boolean } {
  const hash = sha256(bytes)
  const repin = opts.repin?.includes(doc.slug) ?? false
  if (doc.sha256 && doc.sha256 === hash) return { status: 'fetched', write: true }
  if (opts.pin && (doc.sha256 === null || repin)) return { status: 'pinned', write: true }
  return { status: doc.sha256 === null ? 'unpinned' : 'mismatch', write: false }
}

async function fetchOne(
  doc: ManifestDocument,
  opts: FetchOptions,
  inbox: Map<string, string>,
): Promise<FetchResult> {
  const target = join(opts.cacheDir, ...cachePath(doc).split('/'))
  const repin = opts.repin?.includes(doc.slug) ?? false
  const cached = await readIf(target)
  if (cached && !sniffProblem(doc.file, cached)) {
    const hash = sha256(cached)
    const seen = { slug: doc.slug, sha256: hash, size: cached.length, from: target, errors: [] }
    if (doc.sha256 === hash && !repin) return { ...seen, status: 'cached' }
    // A file placed in the cache by hand pins like a download.
    if (opts.pin && (doc.sha256 === null || repin)) return { ...seen, status: 'pinned' }
    if (opts.offline) return { ...seen, status: doc.sha256 === null ? 'unpinned' : 'mismatch' }
  }
  if (doc.sha256 && inbox.has(doc.sha256)) {
    const from = inbox.get(doc.sha256)!
    const bytes = await fs.readFile(from)
    await writeAtomic(target, bytes)
    await fs.rm(from)
    return {
      slug: doc.slug,
      status: 'inbox',
      sha256: doc.sha256,
      size: bytes.length,
      from,
      errors: [],
    }
  }
  if (opts.offline) return { slug: doc.slug, status: 'failed', errors: ['offline'] }
  const errors: string[] = []
  for (const url of [doc.url, ...doc.mirrors]) {
    const got = await download(url, doc, opts)
    if ('error' in got) {
      errors.push(`${url}: ${got.error}`)
      continue
    }
    const { status, write } = accept(doc, got.bytes, opts)
    const result: FetchResult = {
      slug: doc.slug,
      status,
      sha256: sha256(got.bytes),
      size: got.bytes.length,
      from: url,
      errors,
    }
    if (write) await writeAtomic(target, got.bytes)
    return result
  }
  return { slug: doc.slug, status: 'failed', errors }
}

/** Fetch the manifest's documents; returns one result per document, in manifest order. */
export async function fetchDocuments(
  manifest: DocumentsManifest,
  opts: FetchOptions,
): Promise<FetchResult[]> {
  const docs = manifest.documents.filter((d) => !opts.only?.length || opts.only.includes(d.slug))
  const inbox = await scanInbox(opts.cacheDir)
  const results: FetchResult[] = new Array(docs.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < docs.length) {
      const i = next++
      const doc = docs[i]!
      results[i] = await fetchOne(doc, opts, inbox)
      opts.log?.(`  ${results[i].status.padEnd(8)} ${doc.slug}`)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 6) }, worker))
  return results
}

/** The manifest with pinned hashes and sizes recorded from the results. */
export function applyPins(
  manifest: DocumentsManifest,
  results: readonly FetchResult[],
  today: string,
): DocumentsManifest {
  const pins = new Map(results.filter((r) => r.status === 'pinned').map((r) => [r.slug, r]))
  return {
    ...manifest,
    documents: manifest.documents.map((d) => {
      const r = pins.get(d.slug)
      return r ? { ...d, sha256: r.sha256!, size: r.size!, pinned: today } : d
    }),
  }
}

/** Human-readable lines for the documents the owner must download by hand. */
export function manualDownloadLines(
  manifest: DocumentsManifest,
  results: readonly FetchResult[],
  cacheDir: string,
): string[] {
  const bySlug = new Map(manifest.documents.map((d) => [d.slug, d]))
  const lines: string[] = []
  for (const r of results) {
    if (r.status !== 'failed' && r.status !== 'mismatch' && r.status !== 'unpinned') continue
    const d = bySlug.get(r.slug)!
    const why =
      r.status === 'mismatch'
        ? `sha256 ${r.sha256} differs from the pinned ${d.sha256} (new edition? check, then --repin ${d.slug})`
        : r.status === 'unpinned'
          ? 'not pinned yet (run with --pin)'
          : (r.errors.at(-1) ?? 'failed')
    lines.push(`${d.slug} [${d.pack}]: ${why}`)
    lines.push(`    ${d.url}`)
    lines.push(
      `    save as ${join(cacheDir, ...cachePath(d).split('/'))} or drop it in ${join(cacheDir, 'inbox')}/`,
    )
  }
  return lines
}
