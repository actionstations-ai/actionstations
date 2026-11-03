// Output-token caps for a stage call (#591). A prompt's `maxTokens` is sized for the answer; a
// reasoning model spends part of the same budget thinking, so the cap grows by the profile's
// allowance, but never past what the loaded context leaves after the prompt. A reply cut off at
// the length limit is retried once with a larger, still bounded, cap.
import { reasoningAllowance, type InferenceOptions } from '@shared/model-profiles'
import { estimateTokens } from '../ingest/chunker'
import type { TextProvider } from '../providers/types'

/** Never ask for less than this, even when the context looks full: the estimate is rough. */
export const MIN_CAP = 512
/** The word-count estimate runs low for JSON and non-English text; leave this share as slack. */
const PROMPT_SLACK = 1.25
/** A retry never asks for more than this many extra tokens over the first request. */
export const MAX_RETRY_GROWTH = 12_000

export interface OutputCap {
  /** Tokens to request first. */
  cap: number
  /** Most tokens the context can hold for the reply; undefined when the context size is unknown. */
  room?: number
}

/** Tokens the context leaves for the reply after the prompt, or undefined when unknown. */
export function contextRoom(promptText: string, contextWindow?: number): number | undefined {
  if (!contextWindow) return undefined
  const prompt = Math.ceil(estimateTokens(promptText) * PROMPT_SLACK)
  return Math.max(MIN_CAP, contextWindow - prompt)
}

export function planOutputCap(input: {
  stageCap: number
  modelId: string
  options?: InferenceOptions
  promptText: string
  contextWindow?: number
}): OutputCap {
  const wanted = input.stageCap + reasoningAllowance(input.modelId, input.options)
  const room = contextRoom(input.promptText, input.contextWindow)
  return { cap: room === undefined ? wanted : Math.min(wanted, room), ...(room ? { room } : {}) }
}

/** The cap for the one retry after a length cut-off; undefined when it cannot be larger. */
export function retryCap(current: number, room?: number): number | undefined {
  const grown = Math.min(current * 2, current + MAX_RETRY_GROWTH)
  const next = room === undefined ? grown : Math.min(grown, room)
  return next > current ? next : undefined
}

const windows = new WeakMap<TextProvider, Map<string, number | undefined>>()

/** The model's context window as the provider lists it; undefined when it does not say. */
export async function contextWindowOf(
  provider: TextProvider,
  model: string,
): Promise<number | undefined> {
  const known = windows.get(provider)
  if (known?.has(model)) return known.get(model)
  const size = await provider.listModels().then(
    (models) => models.find((m) => m.id === model)?.contextWindow,
    () => undefined,
  )
  windows.set(provider, (known ?? new Map()).set(model, size))
  return size
}
