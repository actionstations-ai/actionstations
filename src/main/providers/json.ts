import { z } from 'zod'
import type { JsonSchemaSpec } from './types'

/** Build the JSON-schema spec adapters send for structured output. */
export function jsonSpec(name: string, schema: z.ZodType): JsonSchemaSpec {
  const js = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io: 'output',
    unrepresentable: 'any',
  }) as Record<string, unknown>
  delete js.$schema
  return { name, schema: js }
}

/**
 * Pull a JSON value out of model text: prefers a ```json fenced block, then the first
 * balanced {...} or [...] span. Returns undefined when nothing parses.
 */
export function extractJson(text: string): unknown {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const candidates = fence?.[1] ? [fence[1], text] : [text]
  for (const c of candidates) {
    const trimmed = c.trim()
    try {
      return JSON.parse(trimmed)
    } catch {
      /* fall through */
    }
    const span = balancedSpan(trimmed)
    if (span) {
      try {
        return JSON.parse(span)
      } catch {
        /* fall through */
      }
    }
  }
  return undefined
}

function balancedSpan(s: string): string | undefined {
  const start = s.search(/[{[]/)
  if (start < 0) return undefined
  const open = s[start]!
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return undefined
}
