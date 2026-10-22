// transformers.js feature extraction over a downloaded model, offline only. Runs inside the
// embedding utilityProcess (embed-worker.ts); tests and non-Electron runs load it in-process.
import type * as TransformersModule from '@huggingface/transformers'
import { AppError } from '../../lib/errors'
import { isModelDownloaded } from './model-files'

const DTYPE = 'fp32'

type Transformers = typeof TransformersModule
interface Extractor {
  (
    texts: string[],
    opts: { pooling: 'mean'; normalize: boolean },
  ): Promise<{ data: ArrayLike<number>; dims: number[] }>
  dispose?: () => Promise<void>
}

let transformersPromise: Promise<Transformers> | undefined
const extractors = new Map<string, Promise<Extractor>>()

async function loadTransformers(modelsDir: string): Promise<Transformers> {
  transformersPromise ??= import('@huggingface/transformers')
  const t = await transformersPromise
  t.env.cacheDir = modelsDir
  t.env.localModelPath = modelsDir
  t.env.allowLocalModels = true
  t.env.allowRemoteModels = false
  return t
}

async function createExtractor(modelsDir: string, model: string): Promise<Extractor> {
  const t = await loadTransformers(modelsDir)
  const pipe = await t.pipeline('feature-extraction', model, { dtype: DTYPE })
  return pipe as unknown as Extractor
}

export function notDownloadedError(model: string): AppError {
  return new AppError(
    'PROVIDER',
    `Local embedding model ${model} is not downloaded. Download it in Settings → Embeddings, or switch to built-in embeddings.`,
  )
}

function extractorFor(modelsDir: string, model: string): Promise<Extractor> {
  if (!isModelDownloaded(modelsDir, model)) throw notDownloadedError(model)
  const key = `${modelsDir}\u0000${model}`
  let e = extractors.get(key)
  if (!e) {
    e = createExtractor(modelsDir, model)
    e.catch(() => extractors.delete(key))
    extractors.set(key, e)
  }
  return e
}

function splitRows(output: { data: ArrayLike<number>; dims: number[] }): Float32Array[] {
  const [rows = 0, dims = 0] = output.dims
  const data = Float32Array.from(output.data as ArrayLike<number>)
  return Array.from({ length: rows }, (_, i) => data.slice(i * dims, (i + 1) * dims))
}

/** Mean-pooled, unit-length vectors for one batch of texts. */
export async function embedBatch(
  modelsDir: string,
  model: string,
  texts: string[],
): Promise<Float32Array[]> {
  const extractor = await extractorFor(modelsDir, model)
  return splitRows(await extractor(texts, { pooling: 'mean', normalize: true }))
}

/** Release every loaded model (ONNX sessions hold native memory). */
export async function disposeAll(): Promise<void> {
  const all = [...extractors.values()]
  extractors.clear()
  for (const e of all) await (await e.catch(() => undefined))?.dispose?.()
}
