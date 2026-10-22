// Local ONNX embeddings via @huggingface/transformers (ADR-0005). The model lives under
// userData/models and is only fetched by downloadModel() (the embeddings:download-model job).
// Inference runs in an Electron utilityProcess (embed-host.ts, #65) so a native crash cannot
// take the app down; nothing here touches the network.
import { embedRunner, type EmbedRunner } from './embed-host'
import { assertModelId, isModelDownloaded, modelDims } from './model-files'
import { notDownloadedError } from './onnx-runtime'
import type { QueryAwareEmbedder } from './query-aware'

export {
  DEFAULT_LOCAL_MODEL,
  assertModelId,
  downloadModel,
  isModelDownloaded,
  modelDims,
  progressTracker,
  type DownloadProgress,
} from './model-files'

const BGE_QUERY_PREFIX = 'Represent this sentence for searching relevant passages: '
/**
 * Inputs per inference call. Measured in the utilityProcess on Apple M-series with 600
 * ~300-token passages: 8, 16 and 32 all index in 12–18 s (~25 ms/passage, no throughput gain
 * above 8); 64 crashes the child (SIGTRAP, now contained). 16 leaves 4× headroom.
 */
export const BATCH_SIZE = 16

export class LocalOnnxEmbedder implements QueryAwareEmbedder {
  readonly id = 'local-onnx'
  readonly dims: number

  constructor(
    readonly model: string,
    private readonly modelsDir: string,
    private readonly runner: () => Promise<EmbedRunner> = embedRunner,
  ) {
    assertModelId(model)
    this.dims = modelDims(model)
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<Float32Array[]> {
    if (!texts.length) return []
    if (!isModelDownloaded(this.modelsDir, this.model)) throw notDownloadedError(this.model)
    const runner = await this.runner()
    const out: Float32Array[] = []
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      signal?.throwIfAborted()
      const batch = texts.slice(i, i + BATCH_SIZE)
      out.push(...(await runner.embed(this.modelsDir, this.model, batch)))
    }
    return out
  }

  async embedQuery(text: string, signal?: AbortSignal): Promise<Float32Array> {
    const prefixed = /bge/i.test(this.model) ? BGE_QUERY_PREFIX + text : text
    const [v] = await this.embed([prefixed], signal)
    return v!
  }

  async dispose(): Promise<void> {
    await (await this.runner()).dispose()
  }
}
