// Local embedding model files under userData/models/<org>/<name>/ (ADR-0005). The download is
// the only code path that touches the network for local embeddings; it fetches each required
// file itself (not through transformers.js) so a cancelled job stops the transfer at once (#66).
import { createWriteStream, existsSync, promises as fs } from 'node:fs'
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
]
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/

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
}

const cancelled = () => new AppError('CANCELLED', 'Model download cancelled')

/** Stream one response body into `dest` via a .part file; removes the partial file on failure. */
async function streamToFile(
  res: Response,
  dest: string,
  onBytes: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const part = `${dest}.part`
  await fs.mkdir(dirname(dest), { recursive: true })
  const out = createWriteStream(part)
  let loaded = 0
  try {
    const reader = res.body!.getReader()
    for (;;) {
      if (signal?.aborted) throw cancelled()
      const { done, value } = await reader.read()
      if (done) break
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()))
      loaded += value.byteLength
      onBytes(loaded)
    }
    await new Promise<void>((resolve, reject) =>
      out.end((err?: Error | null) => (err ? reject(err) : resolve())),
    )
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
  for (const file of REQUIRED_FILES) {
    if (opts.signal?.aborted) throw cancelled()
    const dest = join(modelsDir, model, file)
    if (existsSync(dest)) {
      const { size } = await fs.stat(dest)
      track({ status: 'done', file, loaded: size, total: size })
      continue
    }
    const res = await fetchFile(`${HF_BASE}/${model}/resolve/main/${file}`, opts)
    const total = Number(res.headers.get('content-length')) || 0
    await streamToFile(
      res,
      dest,
      (loaded) => track({ status: 'progress', file, loaded, total: Math.max(total, loaded) }),
      opts.signal,
    )
    track({ status: 'done', file })
  }
  if (!isModelDownloaded(modelsDir, model))
    throw new AppError('PROVIDER', `Download of ${model} finished but model files are missing`)
}
