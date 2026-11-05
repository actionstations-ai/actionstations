// Evaluation records and derived criteria (#421). Criteria are derived in main from the
// scenario's evaluation guides so the Facilitate screen, the live evaluator form (#416) and
// the exports share one implementation.
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import {
  EvaluationRecord,
  FactStatement,
  KeyFact,
  Observation,
  RowCriterion,
} from '../schemas/evaluation'
import { MetricResult } from '../schemas/metrics'

const S = z.object({ projectPath: z.string().min(1), scenarioId: SafeId })

export const evaluationChannels = {
  'evaluation:get': channel(S, EvaluationRecord),
  /** Insert or replace one observation (by id); returns the whole record. */
  'evaluation:observe': channel(S.extend({ observation: Observation }), EvaluationRecord),
  'evaluation:remove': channel(S.extend({ observationId: SafeId }), EvaluationRecord),
  /** Every MSEL row's criteria, in MSEL order (FR-4). */
  'evaluation:criteria': channel(S, z.array(RowCriterion)),
  /** The metrics the scenario's toolkits configure and the session a run would read. */
  'evaluation:metrics-plan': channel(
    S,
    z.object({
      metrics: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          toolkitId: z.string(),
          toolkitName: z.string(),
          needsKeyFacts: z.boolean(),
        }),
      ),
      sessionId: z.string().optional(),
    }),
  ),
  /** Compute the toolkits' metrics (decisions from the session log) and store the results. */
  'evaluation:metrics-run': channel(
    S.extend({ sessionId: z.string().max(64).optional() }),
    z.object({
      results: z.array(MetricResult),
      skipped: z.array(z.object({ id: z.string(), reason: z.string() })),
      record: EvaluationRecord,
    }),
  ),
  /** Save the key facts and the values partners state for them (message consistency). */
  'evaluation:metric-inputs': channel(
    S.extend({
      keyFacts: z.array(KeyFact).max(100),
      factStatements: z.array(FactStatement).max(1000),
    }),
    EvaluationRecord,
  ),
}
