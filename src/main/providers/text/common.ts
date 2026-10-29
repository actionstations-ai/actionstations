// Helpers shared by the text adapters.
import type { ModelInfo, ProviderConfig } from '@shared/schemas'
import { looksLikeEmbeddingModel } from '@shared/model-names'
import { AppError } from '../../lib/errors'
import { extractJson } from '../json'
import type { ChatRequest, JsonSchemaSpec } from '../types'

/** Prompt suffix for servers without native structured output. */
export function jsonInstruction(spec: JsonSchemaSpec): string {
  return [
    `Respond with a single JSON value named "${spec.name}" that matches this JSON Schema.`,
    'Respond with JSON only: no prose, no explanations, no markdown outside one ```json block.',
    '```json',
    JSON.stringify(spec.schema),
    '```',
  ].join('\n')
}

/** System prompt plus the cacheable context, for APIs without separate cache blocks. */
export function combinedSystem(req: ChatRequest, extra?: string): string | undefined {
  const parts = [req.system, req.cacheableContext, extra].filter(
    (p): p is string => typeof p === 'string' && p.trim().length > 0,
  )
  return parts.length ? parts.join('\n\n') : undefined
}

/** Parse model text as JSON: strict parse first, then fenced/balanced extraction. */
export function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return extractJson(text)
  }
}

export function guessModelKind(id: string): ModelInfo['kind'] {
  return looksLikeEmbeddingModel(id) ? 'embedding' : 'chat'
}

export function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
  } catch {
    return false
  }
}

export function requireModel(req: ChatRequest, config: ProviderConfig, fallback?: string): string {
  const model = req.model ?? config.defaultModel ?? fallback
  if (!model) throw new AppError('VALIDATION', `Provider "${config.label}" has no model selected`)
  return model
}

export function numberOption(config: ProviderConfig, key: string): number | undefined {
  const v = config.options[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** `options.seed` when it is an integer: a fixed sampling seed for repeatable runs (#434). */
export function seedOption(config: ProviderConfig): number | undefined {
  const v = config.options.seed
  return typeof v === 'number' && Number.isInteger(v) ? v : undefined
}

export function stringOption(config: ProviderConfig, key: string): string | undefined {
  const v = config.options[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/** Non-secret extra headers from options.headers (e.g. OpenRouter's HTTP-Referer). */
export function extraHeaders(config: ProviderConfig): Record<string, string> {
  const h = config.options.headers
  if (!h || typeof h !== 'object') return {}
  return Object.fromEntries(
    Object.entries(h as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === 'string',
    ),
  )
}

export const elapsed = (start: number): number => Date.now() - start
