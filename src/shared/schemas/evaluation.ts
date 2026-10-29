// Exercise evaluation (#421): objectives mapped to FEMA Core Capabilities, one Exercise
// Evaluation Guide (EEG) per capability whose critical tasks come from the plans (cited), and
// the observations evaluators record against them. Ratings are HSEEP's four values and are
// discussion aids for the hot wash and the AAR, never grades of people: no observation names a
// player, and `evaluator` is a free label such as "Evaluator 2".
//
// Every free-text field has a cap: observations arrive from live-play devices (#416) and the
// evaluation guides from a model, so the schema is the boundary, not the UI.
import { z } from 'zod'
import { CoreCapabilityId } from '../core-capabilities'
import { Citation, ExerciseTime, Id, IsoDateTime } from './common'

export const RATINGS = ['met', 'partial', 'not_met', 'not_observed'] as const
export const Rating = z.enum(RATINGS)
export type Rating = z.infer<typeof Rating>

export const RATING_LABELS: Record<Rating, string> = {
  met: 'Met',
  partial: 'Partial',
  not_met: 'Not met',
  not_observed: 'Not observed',
}

/** Caps on free text (characters); the mapper trims model output to them. */
export const EVALUATION_LIMITS = {
  task: 500,
  timing: 120,
  target: 1000,
  why: 500,
  note: 4000,
  evaluator: 60,
  criterionText: 4000,
  rowId: 64,
  criterionId: 200,
  /** Rows and objectives one task can name. */
  refs: 200,
  /** Tasks per guide and guides per scenario (the model writes 3–8 and one per capability). */
  tasksPerEeg: 50,
  eegs: 32,
  observations: 10_000,
} as const

const RowRef = z.string().min(1).max(EVALUATION_LIMITS.rowId)

/**
 * One critical task of an EEG. The live evaluator form (#416) consumes
 * `{ id, capability, task, citation, expectedBy? }`; later specs add fields, never rename or
 * remove those.
 */
export const CriticalTask = z.object({
  id: Id, // "T-03"
  capability: CoreCapabilityId,
  task: z.string().min(1).max(EVALUATION_LIMITS.task), // "Notify the county EMA within 30 minutes of activation"
  /** The plan section the task comes from. */
  citation: Citation,
  /** Role id expected to perform it. */
  expectedBy: Id.optional(),
  /** "within 30 minutes", as the plan states it. */
  timing: z.string().max(EVALUATION_LIMITS.timing).optional(),
  /** MSEL rows where an evaluator should look for it. */
  rowIds: z.array(RowRef).max(EVALUATION_LIMITS.refs).default([]),
  objectiveRefs: z.array(Id).max(EVALUATION_LIMITS.refs).default([]),
  /** A locked task survives a re-run of the eeg stage. */
  locked: z.boolean().default(false),
})
export type CriticalTask = z.infer<typeof CriticalTask>

export const Eeg = z.object({
  capability: CoreCapabilityId,
  /** HSEEP "capability target": one sentence, in the organization's words. */
  target: z.string().max(EVALUATION_LIMITS.target).default(''),
  objectiveRefs: z.array(Id).max(EVALUATION_LIMITS.refs).default([]),
  criticalTasks: z.array(CriticalTask).max(EVALUATION_LIMITS.tasksPerEeg).default([]),
})
export type Eeg = z.infer<typeof Eeg>

export const ObjectiveCapability = z.object({
  objectiveId: Id,
  capability: CoreCapabilityId,
  why: z.string().max(EVALUATION_LIMITS.why).default(''),
})
export type ObjectiveCapability = z.infer<typeof ObjectiveCapability>

export const Evaluation = z.object({
  objectiveCapabilities: z.array(ObjectiveCapability).max(EVALUATION_LIMITS.refs).default([]),
  eegs: z.array(Eeg).max(EVALUATION_LIMITS.eegs).default([]),
})
export type Evaluation = z.infer<typeof Evaluation>

export const emptyEvaluation = (): Evaluation => ({ objectiveCapabilities: [], eegs: [] })

/** A criterion as shown on one MSEL row / inject page; derived from the EEGs, never stored. */
export const RowCriterion = z.object({
  /** The task id, or `${rowId}:expected` for the row's own expected action. */
  id: z.string().min(1).max(EVALUATION_LIMITS.criterionId),
  rowId: RowRef,
  text: z.string().max(EVALUATION_LIMITS.criterionText),
  taskId: Id.optional(),
  capability: CoreCapabilityId.optional(),
  citation: Citation.optional(),
})
export type RowCriterion = z.infer<typeof RowCriterion>

export const Observation = z.object({
  id: Id,
  at: IsoDateTime,
  exerciseTime: ExerciseTime.optional(),
  rowId: RowRef.optional(),
  taskId: Id.optional(),
  criterionId: z.string().min(1).max(EVALUATION_LIMITS.criterionId).optional(),
  rating: Rating,
  note: z.string().max(EVALUATION_LIMITS.note).default(''),
  /** Free label such as "Evaluator 2"; never a person's name by default. */
  evaluator: z.string().max(EVALUATION_LIMITS.evaluator).optional(),
  source: z.enum(['facilitate', 'paper', 'live']).default('facilitate'),
})
export type Observation = z.infer<typeof Observation>

/** scenarios/<id>/evaluation.json. Loose so a newer build's fields survive a save (ADR-0016). */
export const EvaluationRecord = z.looseObject({
  formatVersion: z.number().int().default(1),
  observations: z.array(Observation).max(EVALUATION_LIMITS.observations).default([]),
  updatedAt: IsoDateTime,
})
export type EvaluationRecord = z.infer<typeof EvaluationRecord>
