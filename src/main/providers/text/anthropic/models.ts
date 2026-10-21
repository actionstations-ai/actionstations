// Anthropic model facts used by the adapter: list prices (USD per million tokens, first-party
// API, cached 2026-10-06) and per-model request rules. Prices change; the adapter's cost
// figure is an estimate for the call log, not a bill.
import type { Usage } from '../../types'

export interface ModelPrice {
  input: number
  output: number
  cacheRead: number
  /** Prompts above this many input tokens use the `long` prices. */
  longContextAbove?: number
  long?: { input: number; output: number; cacheRead: number }
}

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5'

export const ANTHROPIC_PRICES: Record<string, ModelPrice> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50, cacheRead: 1 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-7': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-haiku-5-5': {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    longContextAbove: 100_000,
    long: { input: 0.5, output: 2.5, cacheRead: 0.05 },
  },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1 },
}

/** 5-minute cache writes bill at 1.25x the base input price. */
const CACHE_WRITE_MULTIPLIER = 1.25

/** Price entry for a model id, tolerating dated or prefixed ids ("anthropic.claude-…"). */
export function priceFor(model: string): ModelPrice | undefined {
  const ids = Object.keys(ANTHROPIC_PRICES).sort((a, b) => b.length - a.length)
  const hit = ids.find((id) => model === id || model.includes(id))
  return hit ? ANTHROPIC_PRICES[hit] : undefined
}

export function estimateCostUsd(model: string, usage: Usage): number | undefined {
  const p = priceFor(model)
  if (!p) return undefined
  const read = usage.cacheReadTokens ?? 0
  const write = usage.cacheWriteTokens ?? 0
  const totalInput = usage.inputTokens + read + write
  const rate = p.long && p.longContextAbove && totalInput > p.longContextAbove ? p.long : p
  const usd =
    usage.inputTokens * rate.input +
    write * rate.input * CACHE_WRITE_MULTIPLIER +
    read * rate.cacheRead +
    usage.outputTokens * rate.output
  return Math.round((usd / 1_000_000) * 1e6) / 1e6
}

/** Models that reject forced tool_choice ("any"/"tool") with a 400. */
const NO_FORCED_TOOL = /claude-(fable-5-1|mythos-5-1|opus-5-5|sonnet-5-5)/

export function supportsForcedTool(model: string): boolean {
  return !NO_FORCED_TOOL.test(model)
}

/** Sampling parameters (temperature) are rejected on Claude 4.7+ / 5.x models. */
const SAMPLING_OK = /^claude-(3|(opus|sonnet)-4(-[0-6])?($|-\d{8})|haiku-4-5)/

export function supportsTemperature(model: string): boolean {
  return SAMPLING_OK.test(model)
}

/** output_config.effort is accepted on Claude 4.6+ / 5.x (not Haiku 4.5 or older). */
export function supportsEffort(model: string): boolean {
  return /claude-(fable|mythos|opus|sonnet|haiku)-5|claude-(opus|sonnet)-4-[6-9]/.test(model)
}

/** Models where the server-side refusal fallback ("fallbacks": "default") is recommended. */
export function supportsDefaultFallback(model: string): boolean {
  return /^claude-(fable-5-1|opus-5-5|opus-5|sonnet-5-5)$/.test(model)
}
