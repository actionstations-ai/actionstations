// /v1/embeddings client. Dimensions come from options.embeddingDims when configured and are
// otherwise discovered from the first response.
import type { ProviderConfig } from '@shared/schemas'
import { AppError } from '../../../lib/errors'
import { withEmbedLog } from '../../call-log'
import { joinUrl, requestJson } from '../../http'
import type { EmbeddingProvider } from '../../types'
import { numberOption } from '../common'
import { VENDOR, apiBase, authHeaders } from './chat'

const BATCH = 64

interface EmbeddingsResponse {
  data?: { index?: number; embedding: number[] }[]
  usage?: { prompt_tokens?: number }
}

export class OpenAiCompatibleEmbedder implements EmbeddingProvider {
  private discoveredDims?: number

  constructor(
    private readonly config: ProviderConfig,
    private readonly secret: string | undefined,
    readonly model: string,
  ) {}

  get id(): string {
    return this.config.id
  }

  /** 0 until the first response unless options.embeddingDims is set. */
  get dims(): number {
    return this.discoveredDims ?? numberOption(this.config, 'embeddingDims') ?? 0
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<Float32Array[]> {
    if (texts.length === 0) return []
    return withEmbedLog(
      { providerId: this.id, kind: 'openai-compatible', model: this.model },
      async () => {
        const out: Float32Array[] = []
        let tokens = 0
        for (let i = 0; i < texts.length; i += BATCH) {
          const batch = texts.slice(i, i + BATCH)
          const { vectors, inputTokens } = await this.embedBatch(batch, signal)
          out.push(...vectors)
          tokens += inputTokens
        }
        return { value: out, inputTokens: tokens }
      },
    )
  }

  private async embedBatch(
    input: string[],
    signal?: AbortSignal,
  ): Promise<{ vectors: Float32Array[]; inputTokens: number }> {
    const res = await requestJson<EmbeddingsResponse>(
      joinUrl(apiBase(this.config.baseUrl), '/embeddings'),
      {
        method: 'POST',
        headers: authHeaders(this.config, this.secret),
        body: { model: this.model, input },
        signal,
        vendor: VENDOR,
        secret: this.secret,
      },
    )
    const rows = [...(res.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    if (rows.length !== input.length)
      throw new AppError(
        'PROVIDER',
        `${VENDOR} returned ${rows.length} embeddings for ${input.length} inputs`,
      )
    const vectors = rows.map((r) => Float32Array.from(r.embedding))
    this.checkDims(vectors)
    return { vectors, inputTokens: res.usage?.prompt_tokens ?? 0 }
  }

  private checkDims(vectors: Float32Array[]): void {
    for (const v of vectors) {
      this.discoveredDims ??= v.length
      if (v.length !== this.discoveredDims)
        throw new AppError(
          'PROVIDER',
          `Embedding size changed from ${this.discoveredDims} to ${v.length} for ${this.model}`,
        )
    }
  }
}
