// OpenAI-compatible /v1/chat/completions client: LM Studio, Ollama /v1, vLLM, OpenRouter,
// OpenAI. Streaming SSE, structured-output negotiation, reasoning stripped before parsing.
import type { ModelInfo, ProviderConfig, ProviderHealth } from '@shared/schemas'
import { AppError } from '../../../lib/errors'
import { withChatLog } from '../../call-log'
import { joinUrl, request, requestJson, sseEvents } from '../../http'
import { stripThinking, thinkFilter } from '../../think'
import type { ChatRequest, ChatResponse, TextProvider, Usage } from '../../types'
import {
  combinedSystem,
  elapsed,
  extraHeaders,
  guessModelKind,
  isLocalUrl,
  numberOption,
  parseJsonText,
  requireModel,
  seedOption,
  stringOption,
} from '../common'
import { restoreOptionals } from '../strict-schema'
import { jsonModeRequest, modeKey, modesToTry, rememberMode, type JsonMode } from './json-mode'

export const VENDOR = 'OpenAI-compatible server'
type Body = Record<string, unknown>

/** Normalise a configured base URL to the API root that owns /chat/completions. */
export function apiBase(baseUrl: string | undefined): string {
  if (!baseUrl) throw new AppError('VALIDATION', 'OpenAI-compatible provider needs a base URL')
  const u = new URL(baseUrl)
  const path = u.pathname.replace(/\/+$/, '')
  u.pathname = path === '' ? '/v1' : path
  return u.toString().replace(/\/+$/, '')
}

export function authHeaders(config: ProviderConfig, secret?: string): Record<string, string> {
  return { ...extraHeaders(config), ...(secret ? { authorization: `Bearer ${secret}` } : {}) }
}

interface StreamOutcome {
  model?: string
  text: string
  finish?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export class OpenAiCompatibleTextProvider implements TextProvider {
  readonly kind = 'openai-compatible' as const
  constructor(
    readonly config: ProviderConfig,
    private readonly secret: string | undefined,
  ) {}

  get id(): string {
    return this.config.id
  }

  get base(): string {
    return apiBase(this.config.baseUrl)
  }

  listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    return this.fetchModels(signal, 3, 15_000)
  }

  private async fetchModels(
    signal: AbortSignal | undefined,
    retries: number,
    timeoutMs: number,
  ): Promise<ModelInfo[]> {
    const res = await requestJson<{ data?: { id: string; context_length?: number }[] }>(
      joinUrl(this.base, '/models'),
      {
        headers: authHeaders(this.config, this.secret),
        signal,
        timeoutMs,
        retries,
        vendor: VENDOR,
        secret: this.secret,
      },
    )
    return (res.data ?? []).map((m) => ({
      id: m.id,
      kind: guessModelKind(m.id),
      ...(m.context_length ? { contextWindow: m.context_length } : {}),
    }))
  }

  async health(signal?: AbortSignal): Promise<ProviderHealth> {
    const start = Date.now()
    try {
      const models = await this.fetchModels(signal, 0, 5_000)
      return { ok: true, latencyMs: elapsed(start), message: `${models.length} models available` }
    } catch (err) {
      return { ok: false, latencyMs: elapsed(start), message: (err as Error).message }
    }
  }

  chat(req: ChatRequest, onToken?: (t: string) => void): Promise<ChatResponse> {
    const model = requireModel(req, this.config)
    return withChatLog({ providerId: this.id, kind: this.kind, model }, () =>
      req.json ? this.structuredChat(model, req, onToken) : this.plainChat(model, req, onToken),
    )
  }

  private async plainChat(
    model: string,
    req: ChatRequest,
    onToken?: (t: string) => void,
  ): Promise<ChatResponse> {
    const start = Date.now()
    const out = await this.stream(this.body(model, req, combinedSystem(req), {}), req, onToken)
    return this.toResponse(out, model, start, stripThinking(out.text).text)
  }

  private async structuredChat(
    model: string,
    req: ChatRequest,
    onToken?: (t: string) => void,
  ): Promise<ChatResponse> {
    const key = modeKey(this.base, model)
    const modes = modesToTry(key, stringOption(this.config, 'jsonMode'), model)
    for (const [i, mode] of modes.entries()) {
      const start = Date.now()
      const { system, extra } = jsonModeRequest(req, mode)
      try {
        const out = await this.stream(this.body(model, req, system, extra), req, onToken)
        rememberMode(key, mode)
        return this.structuredResponse(out, model, start, mode, req)
      } catch (err) {
        if (!isModeRejection(err) || i === modes.length - 1) throw err
      }
    }
    throw new AppError('INTERNAL', 'unreachable')
  }

  private structuredResponse(
    out: StreamOutcome,
    model: string,
    start: number,
    mode: JsonMode,
    req: ChatRequest,
  ): ChatResponse {
    const text = stripThinking(out.text).text
    const parsed = parseJsonText(text)
    const json = parsed === undefined ? undefined : restoreOptionals(parsed, req.json!.schema)
    return { ...this.toResponse(out, model, start, text), json, structuredVia: mode }
  }

  private body(model: string, req: ChatRequest, system: string | undefined, extra: Body): Body {
    const messages = [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ]
    const body: Body = {
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      ...extra,
    }
    if (req.temperature !== undefined) body.temperature = req.temperature
    const maxTokens = req.maxTokens ?? numberOption(this.config, 'maxTokens')
    if (maxTokens !== undefined) body.max_tokens = maxTokens
    if (req.stop?.length) body.stop = req.stop
    const seed = seedOption(this.config)
    if (seed !== undefined) body.seed = seed
    return body
  }

  private async stream(
    body: Body,
    req: ChatRequest,
    onToken?: (t: string) => void,
  ): Promise<StreamOutcome> {
    const res = await request(joinUrl(this.base, '/chat/completions'), {
      method: 'POST',
      headers: authHeaders(this.config, this.secret),
      body,
      signal: req.signal,
      timeoutMs: numberOption(this.config, 'timeoutMs') ?? 300_000,
      vendor: VENDOR,
      secret: this.secret,
    })
    const emit = thinkFilter(onToken)
    const out: StreamOutcome = { text: '' }
    for await (const ev of sseEvents(res, { signal: req.signal, vendor: VENDOR })) {
      if (!ev.data || ev.data.trim() === '[DONE]') continue
      applyChunk(out, JSON.parse(ev.data) as Body, emit)
    }
    return out
  }

  private toResponse(out: StreamOutcome, model: string, start: number, text: string): ChatResponse {
    const usage: Usage = {
      inputTokens: out.usage?.prompt_tokens ?? 0,
      outputTokens: out.usage?.completion_tokens ?? 0,
    }
    return {
      text,
      model: out.model ?? model,
      usage,
      finishReason: FINISH_MAP[out.finish ?? ''] ?? 'other',
      costUsd: this.cost(usage),
      latencyMs: elapsed(start),
    }
  }

  /** Local servers cost nothing; remote ones only when the user configured prices. */
  private cost(u: Usage): number | undefined {
    const inP = numberOption(this.config, 'inputUsdPerMTok')
    const outP = numberOption(this.config, 'outputUsdPerMTok')
    if (inP !== undefined && outP !== undefined)
      return (u.inputTokens * inP + u.outputTokens * outP) / 1_000_000
    return isLocalUrl(this.base) ? 0 : undefined
  }
}

const FINISH_MAP: Record<string, ChatResponse['finishReason']> = {
  stop: 'stop',
  length: 'length',
  tool_calls: 'tool_use',
  content_filter: 'other',
}

function applyChunk(out: StreamOutcome, chunk: Body, emit: (t: string) => void): void {
  if (chunk.error) {
    const e = chunk.error as { message?: string } | string
    throw new AppError(
      'PROVIDER',
      `${VENDOR} stream error: ${typeof e === 'string' ? e : (e.message ?? 'unknown')}`,
    )
  }
  if (typeof chunk.model === 'string') out.model = chunk.model
  if (chunk.usage && typeof chunk.usage === 'object')
    out.usage = chunk.usage as StreamOutcome['usage']
  const choice = (chunk.choices as Body[] | undefined)?.[0]
  if (!choice) return
  const delta = choice.delta as Body | undefined
  // reasoning_content / reasoning (gpt-oss, DeepSeek) are never part of the answer.
  if (typeof delta?.content === 'string' && delta.content) {
    out.text += delta.content
    emit(delta.content)
  }
  if (typeof choice.finish_reason === 'string') out.finish = choice.finish_reason
}

/** A 400/422 on a structured request means "this response_format is not supported here". */
function isModeRejection(err: unknown): boolean {
  if (!(err instanceof AppError) || err.code !== 'PROVIDER') return false
  const status = (err.details as { status?: number } | undefined)?.status
  return status === 400 || status === 422 || status === 501
}
