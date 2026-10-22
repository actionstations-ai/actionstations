// Structured-output mode negotiation for OpenAI-compatible servers. Order of preference:
// response_format json_schema (strict) → json_object → prompt-only. The first mode a
// server+model accepts is remembered in memory for the rest of the session.
import type { ChatRequest } from '../../types'
import { combinedSystem, jsonInstruction } from '../common'
import { toStrictSchema } from '../strict-schema'

export type JsonMode = 'json_schema' | 'json_object' | 'prompt'
export const JSON_MODES: readonly JsonMode[] = ['json_schema', 'json_object', 'prompt']

const workingMode = new Map<string, JsonMode>()

export const modeKey = (baseUrl: string, model: string): string => `${baseUrl}|${model}`

export function rememberedMode(key: string): JsonMode | undefined {
  return workingMode.get(key)
}

export function rememberMode(key: string, mode: JsonMode): void {
  workingMode.set(key, mode)
}

/** Test hook. */
export function clearJsonModeCache(): void {
  workingMode.clear()
}

/**
 * Reasoning models (gpt-oss, o-series, DeepSeek-R1, QwQ) under LM Studio's strict
 * `json_schema` mode return one truncated item and stop (#81); they are started from
 * `json_object`, where the instruction-carrying prompt yields complete output.
 */
const REASONING_MODEL = /gpt-oss|\bo[134](?:-mini|-pro)?\b|deepseek-r1|\bqwq\b|reasoning/i

export function defaultModeFor(model: string): JsonMode {
  return REASONING_MODEL.test(model) ? 'json_object' : 'json_schema'
}

/** Modes to try, starting from a configured override, the remembered mode, or the model's default. */
export function modesToTry(key: string, override?: string, model = ''): JsonMode[] {
  const first = (JSON_MODES as readonly string[]).includes(override ?? '')
    ? (override as JsonMode)
    : (rememberedMode(key) ?? defaultModeFor(model))
  return JSON_MODES.slice(JSON_MODES.indexOf(first))
}

type Body = Record<string, unknown>

/** Fields to merge into the request body, and the system prompt to use, for one mode. */
export function jsonModeRequest(
  req: ChatRequest,
  mode: JsonMode,
): { system?: string; extra: Body } {
  const spec = req.json!
  if (mode === 'json_schema') {
    const strict = toStrictSchema(spec.schema)
    return {
      system: combinedSystem(req),
      extra: {
        response_format: {
          type: 'json_schema',
          json_schema: { name: safeName(spec.name), strict: strict.strict, schema: strict.schema },
        },
      },
    }
  }
  const system = combinedSystem(req, jsonInstruction(spec))
  if (mode === 'json_object') return { system, extra: { response_format: { type: 'json_object' } } }
  return { system, extra: {} }
}

function safeName(name: string): string {
  return (name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'result').slice(0, 64)
}
