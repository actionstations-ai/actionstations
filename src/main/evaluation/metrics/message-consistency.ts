// Message consistency (spec 0448 FR-12): whether partners' messages agree on key facts. The
// evaluator enters each partner's stated value for each key fact; the comparison is
// deterministic (trimmed, case-folded; numbers within a tolerance). A model can suggest
// statements from message text (see suggest.ts) but a suggestion counts only once the evaluator
// has confirmed it, so the score never rests on a model's reading alone.
import { z } from 'zod'
import {
  NOT_AVAILABLE,
  ratio,
  ratioText,
  stringList,
  type Metric,
  type MetricOutput,
} from './types'

export const MessageConsistencyConfig = z.object({
  /** Numbers within this absolute difference count as the same value. */
  numericTolerance: z.number().min(0).default(0),
  /** Partners expected to state every fact; a missing statement is listed. */
  partners: stringList.default([]),
})
export type MessageConsistencyConfig = z.infer<typeof MessageConsistencyConfig>

export interface KeyFact {
  id: string
  label: string
}

export interface FactStatement {
  factId: string
  partner: string
  value: string
  /** True on a model suggestion the evaluator has not confirmed; such a statement is not counted. */
  suggested?: boolean
}

export interface MessageConsistencyInputs {
  facts: KeyFact[]
  statements: FactStatement[]
}

export function normalizeValue(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!]+$/g, '')
}

const NUMBER = /^-?\d+(\.\d+)?$/

export function sameValue(a: string, b: string, tolerance: number): boolean {
  const x = normalizeValue(a)
  const y = normalizeValue(b)
  if (x === y) return true
  return NUMBER.test(x) && NUMBER.test(y) && Math.abs(Number(x) - Number(y)) <= tolerance
}

type Verdict = 'consistent' | 'conflict' | 'single' | 'none'

function verdict(values: string[], tolerance: number): Verdict {
  if (values.length === 0) return 'none'
  if (values.length === 1) return 'single'
  return values.every((v) => sameValue(v, values[0]!, tolerance)) ? 'consistent' : 'conflict'
}

const VERDICT_TEXT: Record<Verdict, string> = {
  consistent: 'Consistent',
  conflict: 'Conflict',
  single: 'Only one partner stated it',
  none: 'Not stated',
}

export function computeMessageConsistency(
  inputs: MessageConsistencyInputs,
  config: MessageConsistencyConfig,
): MetricOutput {
  const confirmed = inputs.statements.filter((s) => !s.suggested)
  const skipped = inputs.statements.length - confirmed.length
  const rows = inputs.facts.map((f) => {
    const own = confirmed.filter((s) => s.factId === f.id)
    const v = verdict(
      own.map((s) => s.value),
      config.numericTolerance,
    )
    const missing = config.partners.filter((p) => !own.some((s) => s.partner === p))
    return { fact: f, own, v, missing }
  })
  const count = (v: Verdict) => rows.filter((r) => r.v === v).length
  const score = ratio(count('consistent'), count('consistent') + count('conflict'))
  return {
    metricId: 'message_consistency',
    title: 'Message consistency',
    config,
    inputs: [
      { label: 'Key facts', value: String(inputs.facts.length) },
      { label: 'Confirmed statements', value: String(confirmed.length) },
      { label: 'Unconfirmed suggestions left out', value: String(skipped) },
      { label: 'Numeric tolerance', value: String(config.numericTolerance) },
    ],
    summary: [
      { label: 'Consistent facts', value: String(count('consistent')) },
      { label: 'Conflicting facts', value: String(count('conflict')) },
      { label: 'Facts stated by one partner only', value: String(count('single')) },
      { label: 'Facts not stated', value: String(count('none')) },
      { label: 'Consistency (consistent / compared)', value: ratioText(score) },
    ],
    tables: [
      {
        title: 'Key facts by partner',
        columns: ['Fact', 'Result', 'Statements', 'Partners missing'],
        rows: rows.map((r) => [
          r.fact.label,
          VERDICT_TEXT[r.v],
          r.own.map((s) => `${s.partner}: ${s.value}`).join('; ') || NOT_AVAILABLE,
          r.missing.join(', '),
        ]),
      },
    ],
    caveats: [
      'The comparison is exact after trimming, case-folding and the numeric tolerance; two wordings of the same fact count as a conflict until the evaluator enters them as the same value.',
      ...(skipped > 0
        ? [`${skipped} model-suggested statement(s) were not confirmed and are not counted.`]
        : []),
    ],
    data: {
      consistent: count('consistent'),
      conflict: count('conflict'),
      single: count('single'),
      none: count('none'),
      score,
      byFact: Object.fromEntries(rows.map((r) => [r.fact.id, r.v])),
    },
  }
}

export const messageConsistency: Metric<MessageConsistencyConfig, MessageConsistencyInputs> = {
  id: 'message_consistency',
  title: 'Message consistency',
  configSchema: MessageConsistencyConfig,
  compute: computeMessageConsistency,
}
