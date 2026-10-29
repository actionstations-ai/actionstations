// Evaluation records and derived criteria (#421). Criteria are derived in main from the
// scenario's evaluation guides so the Facilitate screen, the live evaluator form (#416) and
// the exports share one implementation.
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { EvaluationRecord, Observation, RowCriterion } from '../schemas/evaluation'

const S = z.object({ projectPath: z.string().min(1), scenarioId: SafeId })

export const evaluationChannels = {
  'evaluation:get': channel(S, EvaluationRecord),
  /** Insert or replace one observation (by id); returns the whole record. */
  'evaluation:observe': channel(S.extend({ observation: Observation }), EvaluationRecord),
  'evaluation:remove': channel(S.extend({ observationId: SafeId }), EvaluationRecord),
  /** Every MSEL row's criteria, in MSEL order (FR-4). */
  'evaluation:criteria': channel(S, z.array(RowCriterion)),
}
