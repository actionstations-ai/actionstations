// Local embedding model files under userData/models/<org>/<name>/ (ADR-0005). The download is
// the only code path that touches the network for local embeddings; it fetches each required
// file itself (not through transformers.js) so a cancelled job stops the transfer at once (#66).
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { AppError } from '../../lib/errors'

export const DEFAULT_LOCAL_MODEL = 'Xenova/bge-small-en-v1.5'
const HF_BASE = 'https://huggingface.co'
/**
 * Files feature-extraction needs; their presence means the model is downloaded. The ONNX
 * weights come first so the job's progress tracks the one large file.
 */
export const REQUIRED_FILES = [
  'onnx/model.onnx',
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
] as const
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/

/** A Hugging Face commit and the sha256 of every required file at that commit (#212). */
export interface ModelPin {
  revision: string
  sha256: Record<(typeof REQUIRED_FILES)[number], string>
}

/**
 * Known models are downloaded from a fixed commit and every file is checked against its sha256,
 * so a changed or tampered upstream file is refused instead of loaded. Values come from the
 * public hub API (revision/main, paths-info LFS oids; small files hashed at the commit).
 * Other model ids still download from `main`, unverified. (The tokenizer lines carry
 * gitleaks:allow: they are public file checksums, not secrets.)
 */
export const MODEL_PINS: Record<string, ModelPin> = {
  'Xenova/bge-small-en-v1.5': {
    revision: 'ea104dacec62c0de699686887e3f920caeb4f3e3',
    sha256: {
      'onnx/model.onnx': '828e1496d7fabb79cfa4dcd84fa38625c0d3d21da474a00f08db0f559940cf35',
      'config.json': 'fa73f90bf92c8cace1fbcb709626306f2bdbc9ea3e5b5f94b440df9b6aa56350',
      'tokenizer.json': 'd241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66', // gitleaks:allow
      'tokenizer_config.json': '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3', // gitleaks:allow
    },
  },
  'Xenova/bge-base-en-v1.5': {
    revision: '4d6cd88e18e51a5e020c2c305726d76ada9c03cf',
    sha256: {
      'onnx/model.onnx': '9bc579acdba21c253c62a9bf866891355a63ffa3442b52c8a37d75b2ccb91848',
      'config.json': 'd83c21fa7366994560727112ef0a31d8a2ec1c280c2a3e66326fdb877f64c91e',
      'tokenizer.json': 'd241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66', // gitleaks:allow
      'tokenizer_config.json': '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3', // gitleaks:allow
    },
  },
  'Xenova/all-MiniLM-L6-v2': {
    revision: '751bff37182d3f1213fa05d7196b954e230abad9',
    sha256: {
      'onnx/model.onnx': '759c3cd2b7fe7e93933ad23c4c9181b7396442a2ed746ec7c1d46192c469c46e',
      'config.json': '7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7',
      'tokenizer.json': 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0', // gitleaks:allow
      'tokenizer_config.json': '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3', // gitleaks:allow
    },
  },
  'nomic-ai/nomic-embed-text-v1.5': {
    revision: 'e9b6763023c676ca8431644204f50c2b100d9aab',
    sha256: {
      'onnx/model.onnx': '147d5aa88c2101237358e17796cf3a227cead1ec304ec34b465bb08e9d952965',
      'config.json': '9ab00bd92cee80a569f708140b7b6c1661a65891ff3765b1519e181ba2f2c92b',
      'tokenizer.json': 'd241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66', // gitleaks:allow
      'tokenizer_config.json': 'd7e0000bcc80134debd2222220427e6bf5fa20a669f40a0d0d1409cc18e0a9bc', // gitleaks:allow
    },
  },
}

const KNOWN_DIMS: Record<string, number> = {
  'Xenova/bge-small-en-v1.5': 384,
  'Xenova/bge-base-en-v1.5': 768,
  'Xenova/all-MiniLM-L6-v2': 384,
  'nomic-ai/nomic-embed-text-v1.5': 768,
}

export interface DownloadProgress {
  file?: string
  /** 0..1 across all files seen so far. */
  progress: number
  loadedBytes: number
  totalBytes: number
}

export function assertModelId(model: string): void {
  if (!MODEL_ID.test(model) || model.includes('..'))
    throw new AppError('VALIDATION', `Invalid embedding model id "${model}"`)
}

export function modelDims(model: string): number {
  return KNOWN_DIMS[model] ?? 384
}

export function isModelDownloaded(modelsDir: string, model: string): boolean {
  assertModelId(model)
  return REQUIRED_FILES.every((f) => existsSync(join(modelsDir, model, f)))
}

/** Aggregates per-file byte counts into one overall fraction. */
export function progressTracker(report: (p: DownloadProgress) => void): (info: unknown) => void {
  const files = new Map<string, { loaded: number; total: number }>()
  return (info) => {
    const e = info as { status?: string; file?: string; loaded?: number; total?: number }
    if (!e.file || (e.status !== 'progress' && e.status !== 'done')) return
    const prev = files.get(e.file) ?? { loaded: 0, total: 0 }
    const total = e.total ?? prev.total
    const loaded = e.status === 'done' ? Math.max(total, prev.loaded) : (e.loaded ?? prev.loaded)
    files.set(e.file, { loaded, total })
    let l = 0
    let t = 0
    for (const f of files.values()) {
      l += f.loaded
      t += f.total
    }
    report({ file: e.file, progress: t ? l / t : 0, loadedBytes: l, totalBytes: t })
  }
}

export interface DownloadOptions {
  onProgress?: (p: DownloadProgress) => void
  signal?: AbortSignal
  /** Injected in tests. */
  fetchImpl?: typeof fetch
  /** Pins to use instead of MODEL_PINS (tests). */
  pins?: Record<string, ModelPin>
}

const cancelled = () => new AppError('CANCELLED', 'Model download cancelled')

async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

function checksumError(model: string, file: string): AppError {
  return new AppError(
    'PROVIDER',
    `Model download failed: ${model}/${file} does not match its expected checksum. The file was removed; try the download again.`,
  )
}

/**
 * Stream one response body into `dest` via a .part file; removes the partial file on failure.
 * With `expected`, the sha256 of the bytes must match before the file is kept.
 */
async function streamToFile(
  res: Response,
  dest: string,
  onBytes: (loaded: number) => void,
  check: { expected?: string | undefined; onMismatch: () => AppError },
  signal?: AbortSignal,
): Promise<void> {
  const part = `${dest}.part`
  await fs.mkdir(dirname(dest), { recursive: true })
  const out = createWriteStream(part)
  const hash = createHash('sha256')
  let loaded = 0
  try {
    const reader = res.body!.getReader()
    for (;;) {
      if (signal?.aborted) throw cancelled()
      const { done, value } = await reader.read()
      if (done) break
      hash.update(value)
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()))
      loaded += value.byteLength
      onBytes(loaded)
    }
    await new Promise<void>((resolve, reject) =>
      out.end((err?: Error | null) => (err ? reject(err) : resolve())),
    )
    if (check.expected && hash.digest('hex') !== check.expected) throw check.onMismatch()
    await fs.rename(part, dest)
  } catch (err) {
    out.destroy()
    await fs.rm(part, { force: true })
    if (signal?.aborted) throw cancelled()
    throw err
  }
}

async function fetchFile(url: string, opts: DownloadOptions): Promise<Response> {
  const doFetch = opts.fetchImpl ?? fetch
  let res: Response
  try {
    res = await doFetch(url, {
      redirect: 'follow',
      ...(opts.signal ? { signal: opts.signal } : {}),
    })
  } catch (err) {
    if (opts.signal?.aborted) throw cancelled()
    throw new AppError('PROVIDER', `Could not reach Hugging Face: ${(err as Error).message}`)
  }
  if (!res.ok || !res.body)
    throw new AppError('PROVIDER', `Model download failed: HTTP ${res.status} for ${url}`)
  return res
}

/** A file already on disk is kept when it matches its pin (or there is none); else removed. */
async function keepExisting(dest: string, expected: string | undefined): Promise<boolean> {
  if (!existsSync(dest)) return false
  if (!expected || (await sha256OfFile(dest)) === expected) return true
  await fs.rm(dest, { force: true })
  return false
}

/**
 * Download `model` into modelsDir from the Hugging Face hub. Files already present are kept,
 * so a cancelled or failed download resumes where it stopped. Cancelling aborts the transfer.
 */
export async function downloadModel(
  modelsDir: string,
  model: string,
  opts: DownloadOptions = {},
): Promise<void> {
  assertModelId(model)
  const track = progressTracker(opts.onProgress ?? (() => undefined))
  const pin = (opts.pins ?? MODEL_PINS)[model]
  const revision = pin?.revision ?? 'main'
  for (const file of REQUIRED_FILES) {
    if (opts.signal?.aborted) throw cancelled()
    const dest = join(modelsDir, model, file)
    const expected = pin?.sha256[file]
    if (await keepExisting(dest, expected)) {
      const { size } = await fs.stat(dest)
      track({ status: 'done', file, loaded: size, total: size })
      continue
    }
    const res = await fetchFile(`${HF_BASE}/${model}/resolve/${revision}/${file}`, opts)
    const total = Number(res.headers.get('content-length')) || 0
    await streamToFile(
      res,
      dest,
      (loaded) => track({ status: 'progress', file, loaded, total: Math.max(total, loaded) }),
      { expected, onMismatch: () => checksumError(model, file) },
      opts.signal,
    )
    track({ status: 'done', file })
  }
  if (!isModelDownloaded(modelsDir, model))
    throw new AppError('PROVIDER', `Download of ${model} finished but model files are missing`)
}
