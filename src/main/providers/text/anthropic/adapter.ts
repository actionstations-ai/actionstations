// Anthropic Messages API adapter over fetch (ADR-0006): streaming, structured output via a
// single strict tool (ADR-0007), prompt caching of the retrieved context, usage + cost.
import type { ModelInfo, ProviderConfig, ProviderHealth } from '@shared/schemas'
import { AppError } from '../../../lib/errors'
import { withChatLog } from '../../call-log'
import { joinUrl, request, requestJson, sseEvents } from '../../http'
import type { AdapterModule, ChatRequest, ChatResponse, TextProvider } from '../../types'
import { elapsed, numberOption, parseJsonText, stringOption } from '../common'
import { ANTHROPIC_UNSUPPORTED, restoreOptionals, toStrictSchema } from '../strict-schema'
import {
  DEFAULT_ANTHROPIC_MODEL,
  estimateCostUsd,
  supportsDefaultFallback,
  supportsEffort,
  supportsForcedTool,
  supportsTemperature,
} from './models'
import { AnthropicStreamAccumulator, type AnthropicStreamResult } from './stream'

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
export const ANTHROPIC_VERSION = '2023-06-01'
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'
const VENDOR = 'Anthropic'

type Body = Record<string, unknown>

export class AnthropicTextProvider implements TextProvider {
  readonly kind = 'anthropic' as const
  constructor(
    readonly config: ProviderConfig,
    private readonly secret: string | undefined,
  ) {}

  get id(): string {
    return this.config.id
  }

  private get baseUrl(): string {
    return this.config.baseUrl ?? ANTHROPIC_BASE_URL
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    if (!this.secret)
      throw new AppError('VALIDATION', `No API key stored for "${this.config.label}"`)
    return {
      'x-api-key': this.secret,
      'anthropic-version': stringOption(this.config, 'anthropicVersion') ?? ANTHROPIC_VERSION,
      ...extra,
    }
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const out: ModelInfo[] = []
    let after: string | undefined
    for (let page = 0; page < 10; page++) {
      const qs = `limit=100${after ? `&after_id=${encodeURIComponent(after)}` : ''}`
      const res = await requestJson<ModelsPage>(joinUrl(this.baseUrl, `/v1/models?${qs}`), {
        headers: this.headers(),
        signal,
        timeoutMs: 15_000,
        vendor: VENDOR,
        secret: this.secret,
      })
      for (const m of res.data ?? [])
        out.push({
          id: m.id,
          label: m.display_name,
          contextWindow: m.max_input_tokens,
          kind: 'chat',
        })
      if (!res.has_more || !res.last_id) break
      after = res.last_id
    }
    return out
  }

  async health(signal?: AbortSignal): Promise<ProviderHealth> {
    const start = Date.now()
    if (!this.secret) return { ok: false, message: 'No API key stored' }
    try {
      const res = await requestJson<ModelsPage>(joinUrl(this.baseUrl, '/v1/models?limit=1'), {
        headers: this.headers(),
        signal,
        timeoutMs: 10_000,
        retries: 0,
        vendor: VENDOR,
        secret: this.secret,
      })
      return {
        ok: true,
        latencyMs: elapsed(start),
        message: `Reachable (${res.data?.[0]?.id ?? 'no models'})`,
      }
    } catch (err) {
      return { ok: false, latencyMs: elapsed(start), message: (err as Error).message }
    }
  }

  chat(req: ChatRequest, onToken?: (t: string) => void): Promise<ChatResponse> {
    const model = req.model ?? this.config.defaultModel ?? DEFAULT_ANTHROPIC_MODEL
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
    const { body, beta } = this.buildBody(model, req)
    const res = await request(joinUrl(this.baseUrl, '/v1/messages'), {
      method: 'POST',
      headers: this.headers(beta ? { 'anthropic-beta': beta } : {}),
      body,
      signal: req.signal,
      timeoutMs: numberOption(this.config, 'timeoutMs') ?? 120_000,
      vendor: VENDOR,
      secret: this.secret,
    })
    const acc = new AnthropicStreamAccumulator(onToken)
    for await (const ev of sseEvents(res, { signal: req.signal, vendor: VENDOR })) {
      if (!ev.data || ev.data === '[DONE]') continue
      acc.push(JSON.parse(ev.data) as Record<string, unknown>)
    }
    return toChatResponse(acc.result(), model, req, start)
  }

  buildBody(model: string, req: ChatRequest): { body: Body; beta?: string } {
    const body: Body = {
      model,
      max_tokens: req.maxTokens ?? numberOption(this.config, 'maxTokens') ?? 32_000,
      stream: true,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    }
    const system = systemBlocks(req, model)
    if (system.length) body.system = system
    if (req.stop?.length) body.stop_sequences = req.stop
    if (req.temperature !== undefined && supportsTemperature(model))
      body.temperature = req.temperature
    if (supportsEffort(model))
      body.output_config = { effort: stringOption(this.config, 'effort') ?? 'high' }
    if (req.json) Object.assign(body, jsonTool(req.json.name, req.json.schema, model))
    const useFallback =
      this.config.options.fallbacks !== false &&
      this.baseUrl === ANTHROPIC_BASE_URL &&
      supportsDefaultFallback(model)
    if (useFallback) body.fallbacks = 'default'
    return { body, beta: useFallback ? FALLBACK_BETA : undefined }
  }
}

interface ModelsPage {
  data?: { id: string; display_name?: string; max_input_tokens?: number }[]
  has_more?: boolean
  last_id?: string
}

/** Tool names must match ^[a-zA-Z0-9_-]{1,64}$. */
export function toolName(schemaName: string): string {
  return (schemaName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'result').slice(0, 64)
}

function toolInstruction(name: string): string {
  return `Answer by calling the ${name} tool exactly once with the complete result. Do not answer in plain text.`
}

function systemBlocks(req: ChatRequest, model: string): Body[] {
  const blocks: Body[] = []
  if (req.system) blocks.push({ type: 'text', text: req.system })
  // Retrieved doctrine is large and repeated across stages: cache everything up to here.
  if (req.cacheableContext)
    blocks.push({ type: 'text', text: req.cacheableContext, cache_control: { type: 'ephemeral' } })
  if (req.json && !supportsForcedTool(model))
    blocks.push({ type: 'text', text: toolInstruction(toolName(req.json.name)) })
  return blocks
}

function jsonTool(schemaName: string, schema: Record<string, unknown>, model: string): Body {
  const name = toolName(schemaName)
  const strict = toStrictSchema(schema, { dropKeywords: ANTHROPIC_UNSUPPORTED })
  const tool: Body = {
    name,
    description: `Return the ${schemaName} result as structured data.`,
    input_schema: strict.schema,
    eager_input_streaming: true,
  }
  if (strict.strict) tool.strict = true
  const tool_choice = supportsForcedTool(model) ? { type: 'tool', name } : { type: 'auto' }
  return { tools: [tool], tool_choice }
}

const STOP_MAP: Record<string, ChatResponse['finishReason']> = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  max_tokens: 'length',
  tool_use: 'tool_use',
}

function toChatResponse(
  r: AnthropicStreamResult,
  model: string,
  req: ChatRequest,
  start: number,
): ChatResponse {
  if (r.stopReason === 'refusal') {
    const cat = r.stopDetails?.category ? ` (${r.stopDetails.category})` : ''
    throw new AppError('PROVIDER', `Anthropic declined this request${cat}`)
  }
  const served = r.model ?? model
  const base = {
    model: served,
    usage: r.usage,
    finishReason: STOP_MAP[r.stopReason ?? ''] ?? 'other',
    costUsd: estimateCostUsd(served, r.usage),
    latencyMs: elapsed(start),
  } satisfies Partial<ChatResponse>
  if (!req.json) return { ...base, text: r.text }
  const tool = r.toolInputs.find((t) => t.name === toolName(req.json!.name))
  if (tool) {
    const parsed = parseJsonText(tool.json)
    const json = parsed === undefined ? undefined : restoreOptionals(parsed, req.json.schema)
    return { ...base, text: tool.json, json, structuredVia: 'tool_use' }
  }
  // The model answered in text despite the tool: fall back to extracting JSON from it.
  const parsed = parseJsonText(r.text)
  return {
    ...base,
    text: r.text,
    json: parsed === undefined ? undefined : restoreOptionals(parsed, req.json.schema),
    structuredVia: 'prompt',
  }
}

export const adapter: AdapterModule = {
  kind: 'anthropic',
  createText: (config, secret) => new AnthropicTextProvider(config, secret),
}
