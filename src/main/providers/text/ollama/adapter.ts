// Ollama native API adapter: /api/chat (NDJSON streaming, `format` = JSON schema),
// /api/tags, /api/pull with progress, /api/embed, /api/version.
import type { ModelInfo, ProviderConfig, ProviderHealth } from '@shared/schemas'
import { resolveInference } from '@shared/model-profiles'
import { AppError } from '../../../lib/errors'
import { withChatLog, withEmbedLog } from '../../call-log'
import { joinUrl, ndjsonLines, request, requestJson } from '../../http'
import { StreamGuard, streamGuardOption } from '../../stream-guard'
import { stripThinking, thinkFilter } from '../../think'
import type {
  AdapterModule,
  ChatRequest,
  ChatResponse,
  EmbeddingProvider,
  TextProvider,
} from '../../types'
import {
  combinedSystem,
  elapsed,
  numberOption,
  parseJsonText,
  requireModel,
  seedOption,
} from '../common'
import { restoreOptionals } from '../strict-schema'
import { classifyOllamaTags } from './models'

export const OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
const VENDOR = 'Ollama'
type Body = Record<string, unknown>

const baseOf = (config: ProviderConfig): string =>
  (config.baseUrl ?? OLLAMA_BASE_URL).replace(/\/+$/, '').replace(/\/v1$/, '')

interface ChatChunk {
  model?: string
  message?: { content?: string; thinking?: string }
  done?: boolean
  done_reason?: string
  prompt_eval_count?: number
  eval_count?: number
  error?: string
}

export class OllamaTextProvider implements TextProvider {
  readonly kind = 'ollama' as const
  constructor(readonly config: ProviderConfig) {}

  get id(): string {
    return this.config.id
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const base = baseOf(this.config)
    const tags = await requestJson<unknown>(joinUrl(base, '/api/tags'), {
      signal,
      timeoutMs: 10_000,
      vendor: VENDOR,
    })
    return classifyOllamaTags(tags, (name) =>
      requestJson<{ capabilities?: unknown }>(joinUrl(base, '/api/show'), {
        method: 'POST',
        body: { model: name },
        signal,
        timeoutMs: 5_000,
        retries: 0,
        vendor: VENDOR,
      }).then((r) => r.capabilities),
    )
  }

  async health(signal?: AbortSignal): Promise<ProviderHealth> {
    const start = Date.now()
    try {
      const v = await requestJson<{ version?: string }>(
        joinUrl(baseOf(this.config), '/api/version'),
        {
          signal,
          timeoutMs: 5_000,
          retries: 0,
          vendor: VENDOR,
        },
      )
      return { ok: true, latencyMs: elapsed(start), message: `Ollama ${v.version ?? ''}`.trim() }
    } catch (err) {
      return { ok: false, latencyMs: elapsed(start), message: (err as Error).message }
    }
  }

  chat(req: ChatRequest, onToken?: (t: string) => void): Promise<ChatResponse> {
    const model = requireModel(req, this.config)
    return withChatLog({ providerId: this.id, kind: this.kind, model }, () =>
      this.runChat(model, req, onToken),
    )
  }

  private async runChat(
    model: string,
    req: ChatRequest,
    onToken?: (t: string) => void,
  ): Promise<ChatResponse> {
    const start = Date.now()
    const guardOptions = streamGuardOption(this.config.options)
    const guard = guardOptions ? new StreamGuard(guardOptions) : undefined
    const signal =
      guard && req.signal
        ? AbortSignal.any([req.signal, guard.signal])
        : (guard?.signal ?? req.signal)
    guard?.arm()
    try {
      const res = await request(joinUrl(baseOf(this.config), '/api/chat'), {
        method: 'POST',
        body: this.body(model, req),
        signal,
        timeoutMs: guardOptions?.firstTokenMs ?? numberOption(this.config, 'timeoutMs') ?? 300_000,
        vendor: VENDOR,
      }).catch((err: unknown) => {
        throw withPullHint(err, model)
      })
      const emit = thinkFilter(onToken)
      let raw = ''
      let last: ChatChunk = {}
      const idleMs = guardOptions
        ? 2 * Math.max(guardOptions.firstTokenMs, guardOptions.stallMs)
        : undefined
      for await (const line of ndjsonLines(res, { signal, vendor: VENDOR, idleMs })) {
        const chunk = line as ChatChunk
        if (chunk.error) throw new AppError('PROVIDER', `Ollama: ${chunk.error}`)
        const piece = chunk.message?.content ?? ''
        const thought = chunk.message?.thinking ?? ''
        guard?.token(piece + thought)
        if (piece) {
          raw += piece
          emit(piece)
        }
        last = chunk
      }
      return this.toResponse(raw, last, model, req, start)
    } catch (err) {
      throw guard?.tripped ?? err
    } finally {
      guard?.stop()
    }
  }

  private body(model: string, req: ChatRequest): Body {
    const system = combinedSystem(req)
    const options: Body = {}
    const inference = resolveInference({
      modelId: model,
      stageTemperature: req.temperature,
      options: this.config.options,
    })
    if (inference.temperature !== undefined) options.temperature = inference.temperature
    if (inference.topP !== undefined) options.top_p = inference.topP
    if (inference.topK !== undefined) options.top_k = inference.topK
    if (inference.minP !== undefined) options.min_p = inference.minP
    const maxTokens = req.maxTokens ?? numberOption(this.config, 'maxTokens')
    if (maxTokens !== undefined) options.num_predict = maxTokens
    if (req.stop?.length) options.stop = req.stop
    const numCtx = numberOption(this.config, 'numCtx')
    if (numCtx !== undefined) options.num_ctx = numCtx
    const seed = seedOption(this.config)
    if (seed !== undefined) options.seed = seed
    return {
      model,
      stream: true,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...req.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      ...(req.json ? { format: req.json.schema } : {}),
      ...thinkField(inference.reasoning),
      ...(Object.keys(options).length ? { options } : {}),
    }
  }

  private toResponse(
    raw: string,
    last: ChatChunk,
    model: string,
    req: ChatRequest,
    start: number,
  ): ChatResponse {
    const text = stripThinking(raw).text
    const usage = { inputTokens: last.prompt_eval_count ?? 0, outputTokens: last.eval_count ?? 0 }
    const finishReason: ChatResponse['finishReason'] =
      last.done_reason === 'length' ? 'length' : last.done_reason === 'stop' ? 'stop' : 'other'
    const base = {
      text,
      model: last.model ?? model,
      usage,
      finishReason,
      costUsd: 0,
      latencyMs: elapsed(start),
    }
    if (!req.json) return base
    const parsed = parseJsonText(text)
    const json = parsed === undefined ? undefined : restoreOptionals(parsed, req.json.schema)
    return { ...base, json, structuredVia: 'json_schema' }
  }
}

/** Ollama's `think`: a level for effort models (gpt-oss), a boolean for the rest. */
function thinkField(r: ReturnType<typeof resolveInference>['reasoning']): Body {
  if (!r) return {}
  if (r.kind === 'switch') return { think: r.level !== 'off' }
  return { think: r.level === 'off' ? false : r.level }
}

function withPullHint(err: unknown, model: string): unknown {
  if (err instanceof AppError && (err.details as { status?: number } | undefined)?.status === 404)
    return new AppError(
      'PROVIDER',
      `${err.message} — run "ollama pull ${model}" or pull it from Settings`,
      err.details,
    )
  return err
}

export class OllamaEmbedder implements EmbeddingProvider {
  private discoveredDims?: number
  constructor(
    private readonly config: ProviderConfig,
    readonly model: string,
  ) {}

  get id(): string {
    return this.config.id
  }

  get dims(): number {
    return this.discoveredDims ?? numberOption(this.config, 'embeddingDims') ?? 0
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<Float32Array[]> {
    if (!texts.length) return []
    return withEmbedLog({ providerId: this.id, kind: 'ollama', model: this.model }, async () => {
      const res = await requestJson<{ embeddings?: number[][]; prompt_eval_count?: number }>(
        joinUrl(baseOf(this.config), '/api/embed'),
        { method: 'POST', body: { model: this.model, input: texts }, signal, vendor: VENDOR },
      ).catch((err: unknown) => {
        throw withPullHint(err, this.model)
      })
      const rows = res.embeddings ?? []
      if (rows.length !== texts.length)
        throw new AppError(
          'PROVIDER',
          `Ollama returned ${rows.length} embeddings for ${texts.length} inputs`,
        )
      const vectors = rows.map((r) => Float32Array.from(r))
      this.discoveredDims ??= vectors[0]?.length
      return { value: vectors, inputTokens: res.prompt_eval_count }
    })
  }
}

export interface PullProgress {
  status: string
  completed?: number
  total?: number
  /** 0..1 when the current layer reports sizes. */
  fraction?: number
}

/** Pull (download) a model through Ollama, reporting progress lines as they stream. */
export async function pullModel(
  config: ProviderConfig,
  name: string,
  onProgress?: (p: PullProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(name))
    throw new AppError('VALIDATION', `Invalid model name "${name}"`)
  const res = await request(joinUrl(baseOf(config), '/api/pull'), {
    method: 'POST',
    body: { model: name, stream: true },
    signal,
    timeoutMs: 60_000,
    vendor: VENDOR,
  })
  let lastStatus = ''
  for await (const line of ndjsonLines(res, { signal, vendor: VENDOR, idleMs: 600_000 })) {
    const p = line as { status?: string; completed?: number; total?: number; error?: string }
    if (p.error) throw new AppError('PROVIDER', `Ollama pull failed: ${p.error}`)
    lastStatus = p.status ?? lastStatus
    const fraction = p.total && p.completed !== undefined ? p.completed / p.total : undefined
    onProgress?.({ status: lastStatus, completed: p.completed, total: p.total, fraction })
  }
  if (lastStatus !== 'success')
    throw new AppError('PROVIDER', `Ollama pull ended with "${lastStatus || 'no status'}"`)
}

export const adapter: AdapterModule = {
  kind: 'ollama',
  createText: (config) => new OllamaTextProvider(config),
  createEmbedding: (config, _secret, model) => new OllamaEmbedder(config, model),
  localDefaults: [{ label: 'Ollama', baseUrl: OLLAMA_BASE_URL }],
}
