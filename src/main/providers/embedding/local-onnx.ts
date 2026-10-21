// Local ONNX embeddings via @huggingface/transformers (ADR-0005). The model lives under
// userData/models and is only fetched by downloadModel() (the embeddings:download-model job);
// every other load runs with remote models disabled, so nothing touches the network.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type * as TransformersModule from '@huggingface/transformers'
import { AppError } from '../../lib/errors'
import type { QueryAwareEmbedder } from './query-aware'

export const DEFAULT_LOCAL_MODEL = 'Xenova/bge-small-en-v1.5'
const BGE_QUERY_PREFIX = 'Represent this sentence for searching relevant passages: '
/**
 * Inputs per inference call. Under Electron's runtime a batch of 32 full-length (512-token)
 * passages crashes the process (SIGTRAP) while plain Node survives; 16 works, 8 leaves headroom
 * for larger models at the same throughput (~27 ms/passage on Apple M-series).
 */
export const BATCH_SIZE = 8
const DTYPE = 'fp32'
/** Files feature-extraction needs; their presence means the model is downloaded. */
const REQUIRED_FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model.onnx']
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/

const KNOWN_DIMS: Record<string, number> = {
  'Xenova/bge-small-en-v1.5': 384,
  'Xenova/bge-base-en-v1.5': 768,
  'Xenova/all-MiniLM-L6-v2': 384,
  'nomic-ai/nomic-embed-text-v1.5': 768,
}

type Transformers = typeof TransformersModule
interface Extractor {
  (
    texts: string[],
    opts: { pooling: 'mean'; normalize: boolean },
  ): Promise<{
    data: ArrayLike<number>
    dims: number[]
  }>
  dispose?: () => Promise<void>
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

let transformersPromise: Promise<Transformers> | undefined
// Serializes pipeline loads: downloadModel flips the global allowRemoteModels flag.
let loadChain: Promise<unknown> = Promise.resolve()

async function loadTransformers(modelsDir: string): Promise<Transformers> {
  transformersPromise ??= import('@huggingface/transformers')
  const t = await transformersPromise
  t.env.cacheDir = modelsDir
  t.env.localModelPath = modelsDir
  t.env.allowLocalModels = true
  t.env.allowRemoteModels = false
  return t
}

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = loadChain.catch(() => undefined).then(fn)
  loadChain = run
  return run
}

async function createExtractor(
  modelsDir: string,
  model: string,
  remote: boolean,
  onProgress?: (info: unknown) => void,
): Promise<Extractor> {
  return serialized(async () => {
    const t = await loadTransformers(modelsDir)
    t.env.allowRemoteModels = remote
    try {
      const pipe = await t.pipeline('feature-extraction', model, {
        dtype: DTYPE,
        ...(onProgress ? { progress_callback: onProgress } : {}),
      })
      return pipe as unknown as Extractor
    } finally {
      t.env.allowRemoteModels = false
    }
  })
}

/** Aggregates transformers.js per-file progress events into one overall fraction. */
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

/** Download `model` into modelsDir (the only code path that allows remote model files). */
export async function downloadModel(
  modelsDir: string,
  model: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  assertModelId(model)
  const extractor = await createExtractor(
    modelsDir,
    model,
    true,
    onProgress ? progressTracker(onProgress) : undefined,
  )
  await extractor.dispose?.()
  if (!isModelDownloaded(modelsDir, model))
    throw new AppError('PROVIDER', `Download of ${model} finished but model files are missing`)
}

function splitRows(output: { data: ArrayLike<number>; dims: number[] }): Float32Array[] {
  const [rows = 0, dims = 0] = output.dims
  const data = Float32Array.from(output.data as ArrayLike<number>)
  return Array.from({ length: rows }, (_, i) => data.slice(i * dims, (i + 1) * dims))
}

export class LocalOnnxEmbedder implements QueryAwareEmbedder {
  readonly id = 'local-onnx'
  readonly dims: number
  private extractor: Promise<Extractor> | undefined

  constructor(
    readonly model: string,
    private readonly modelsDir: string,
  ) {
    assertModelId(model)
    this.dims = modelDims(model)
  }

  private load(): Promise<Extractor> {
    if (!isModelDownloaded(this.modelsDir, this.model)) {
      throw new AppError(
        'PROVIDER',
        `Local embedding model ${this.model} is not downloaded. Download it in Settings → Embeddings, or switch to built-in embeddings.`,
      )
    }
    this.extractor ??= createExtractor(this.modelsDir, this.model, false).catch((err) => {
      this.extractor = undefined
      throw err
    })
    return this.extractor
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<Float32Array[]> {
    if (!texts.length) return []
    const extractor = await this.load()
    const out: Float32Array[] = []
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      signal?.throwIfAborted()
      const batch = texts.slice(i, i + BATCH_SIZE)
      out.push(...splitRows(await extractor(batch, { pooling: 'mean', normalize: true })))
    }
    return out
  }

  async embedQuery(text: string, signal?: AbortSignal): Promise<Float32Array> {
    const prefixed = /bge/i.test(this.model) ? BGE_QUERY_PREFIX + text : text
    const [v] = await this.embed([prefixed], signal)
    return v!
  }

  async dispose(): Promise<void> {
    const e = await this.extractor?.catch(() => undefined)
    this.extractor = undefined
    await e?.dispose?.()
  }
}
