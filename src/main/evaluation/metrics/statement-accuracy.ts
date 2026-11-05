// Statement accuracy (spec 0458 FR-9): each public statement's claims checked against the
// scenario's fact sheet. The evaluator enters the verdict on each claim; a model may suggest one,
// but a suggestion counts only once the evaluator confirms it. Message consistency across
// spokespeople is the separate `message_consistency` metric.
import { z } from 'zod'
import { NOT_AVAILABLE, ratio, ratioText, type Metric, type MetricOutput } from './types'

export const StatementAccuracyConfig = z.object({})
export type StatementAccuracyConfig = z.infer<typeof StatementAccuracyConfig>

export const CLAIM_STATUSES = ['accurate', 'inaccurate', 'unverifiable'] as const
export type ClaimStatus = (typeof CLAIM_STATUSES)[number]

/** One claim in one statement, checked against the fact sheet. */
export interface StatementCheck {
  statementId: string
  /** What the statement said. */
  claim: string
  /** The fact-sheet entry it was checked against. */
  factLabel: string
  status: ClaimStatus
  /** True on a model suggestion the evaluator has not confirmed; such a check is not counted. */
  suggested?: boolean
}

export interface StatementAccuracyInputs {
  checks: StatementCheck[]
}

const STATUS_TEXT: Record<ClaimStatus, string> = {
  accurate: 'Accurate',
  inaccurate: 'Inaccurate',
  unverifiable: 'Not on the fact sheet',
}

export function computeStatementAccuracy(
  inputs: StatementAccuracyInputs,
  config: StatementAccuracyConfig,
): MetricOutput {
  const confirmed = inputs.checks.filter((c) => !c.suggested)
  const skipped = inputs.checks.length - confirmed.length
  const count = (s: ClaimStatus) => confirmed.filter((c) => c.status === s).length
  const accuracy = ratio(count('accurate'), count('accurate') + count('inaccurate'))
  const ids = [...new Set(confirmed.map((c) => c.statementId))]
  return {
    metricId: 'statement_accuracy',
    title: 'Statement accuracy',
    config,
    inputs: [
      { label: 'Statements checked', value: String(ids.length) },
      { label: 'Claims confirmed by the evaluator', value: String(confirmed.length) },
      { label: 'Unconfirmed suggestions left out', value: String(skipped) },
    ],
    summary: [
      { label: 'Accurate claims', value: String(count('accurate')) },
      { label: 'Inaccurate claims', value: String(count('inaccurate')) },
      { label: 'Claims not on the fact sheet', value: String(count('unverifiable')) },
      { label: 'Accuracy (accurate / checkable)', value: ratioText(accuracy) },
    ],
    tables: [
      {
        title: 'Claims checked',
        columns: ['Statement', 'Claim', 'Fact sheet entry', 'Result'],
        rows: confirmed.map((c) => [
          c.statementId,
          c.claim,
          c.factLabel || NOT_AVAILABLE,
          STATUS_TEXT[c.status],
        ]),
      },
    ],
    caveats: [
      'The evaluator scores each claim against the fact sheet; the score is only as complete as the fact sheet and the claims chosen.',
      'Claims not on the fact sheet are shown but do not change the accuracy ratio.',
      ...(skipped > 0
        ? [`${skipped} model-suggested check(s) were not confirmed and are not counted.`]
        : []),
    ],
    data: {
      accurate: count('accurate'),
      inaccurate: count('inaccurate'),
      unverifiable: count('unverifiable'),
      accuracy,
      statements: ids.length,
    },
  }
}

export const statementAccuracy: Metric<StatementAccuracyConfig, StatementAccuracyInputs> = {
  id: 'statement_accuracy',
  title: 'Statement accuracy',
  configSchema: StatementAccuracyConfig,
  compute: computeStatementAccuracy,
}
