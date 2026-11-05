// The optional model-assisted step of message consistency (spec 0448 FR-12): propose which
// value each partner's message states for each key fact. It goes through the text provider the
// caller resolved for the project (so the cloud gate and its approval apply when the provider is
// hosted) and its output is only ever a list of suggestions; the metric ignores a suggestion
// until the evaluator confirms it.
import { z } from 'zod'
import { extractJson, jsonSpec } from '../../providers/json'
import type { TextProvider } from '../../providers/types'
import type { FactStatement, KeyFact } from './message-consistency'

export interface PartnerMessage {
  partner: string
  text: string
}

const Suggestions = z.object({
  statements: z
    .array(z.object({ factId: z.string(), partner: z.string(), value: z.string() }))
    .max(500),
})

const SYSTEM =
  'You read messages from different partners and report, for each key fact, the value each partner states. ' +
  'Quote or copy the value as written. Omit a fact a partner does not state. Do not infer or reconcile.'

function prompt(facts: KeyFact[], messages: PartnerMessage[]): string {
  return [
    'Key facts:',
    ...facts.map((f) => `- ${f.id}: ${f.label}`),
    '',
    'Messages:',
    ...messages.map((m) => `[${m.partner}] ${m.text}`),
    '',
    'Reply with JSON: {"statements":[{"factId":"...","partner":"...","value":"..."}]}',
  ].join('\n')
}

/** Suggested statements, each marked `suggested`; unknown facts or partners are dropped. */
export async function suggestStatements(
  provider: TextProvider,
  facts: KeyFact[],
  messages: PartnerMessage[],
  opts: { projectPath?: string; signal?: AbortSignal } = {},
): Promise<FactStatement[]> {
  if (facts.length === 0 || messages.length === 0) return []
  const res = await provider.chat({
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt(facts, messages) }],
    temperature: 0,
    json: jsonSpec('key_fact_statements', Suggestions),
    ...(opts.signal ? { signal: opts.signal } : {}),
    outbound: {
      task: 'evaluate',
      stage: 'message_consistency',
      ...(opts.projectPath ? { projectPath: opts.projectPath } : {}),
      excerpts: [],
    },
  })
  const parsed = Suggestions.safeParse(res.json ?? extractJson(res.text))
  if (!parsed.success) return []
  const factIds = new Set(facts.map((f) => f.id))
  const partners = new Set(messages.map((m) => m.partner))
  return parsed.data.statements
    .filter((s) => factIds.has(s.factId) && partners.has(s.partner) && s.value.trim())
    .map((s) => ({ ...s, suggested: true }))
}
