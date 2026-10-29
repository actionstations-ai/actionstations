// Regression drills (#431): a short subset copy of a scenario that reruns the injects whose
// evaluation criteria (#421) were rated not met or partial, after the plan was updated.
// Stored as <project>/drills/<id>.json; each run records the rating per criterion and a verdict
// per corrective action, so the program (#424) can see whether the gap closed.
import { z } from 'zod'
import { Id, IsoDateTime } from './common'
import { Rating } from './evaluation'

export const DRILL_LIMITS = { rows: 500, criteria: 1000, list: 200, runs: 500 } as const

export const DRILL_VERDICTS = ['pass', 'partial', 'fail'] as const
export const DrillVerdict = z.enum(DRILL_VERDICTS)
export type DrillVerdict = z.infer<typeof DrillVerdict>

export const DrillRun = z.object({
  id: Id,
  /** The live session of the drill scenario, when the run was recorded from one. */
  sessionId: Id.optional(),
  ranAt: IsoDateTime,
  /** documentId → sha256 at run time, so a run shows which plan version it tested. */
  documentHashes: z.record(Id, z.string().max(100)).default({}),
  criteria: z
    .array(
      z.object({
        rowId: z.string().max(64),
        criterionId: z.string().max(200),
        taskId: Id.optional(),
        rating: Rating,
      }),
    )
    .max(DRILL_LIMITS.criteria)
    .default([]),
  correctiveActions: z
    .array(z.object({ id: Id, verdict: DrillVerdict, note: z.string().max(200).optional() }))
    .max(DRILL_LIMITS.list)
    .default([]),
  programRecorded: z.boolean().default(false),
})
export type DrillRun = z.infer<typeof DrillRun>

export const Drill = z.looseObject({
  formatVersion: z.number().int().default(1),
  id: Id,
  title: z.string().min(1).max(300),
  sourceScenarioId: Id,
  sourceSessionId: Id.optional(),
  rowIds: z.array(z.string().max(64)).min(1).max(DRILL_LIMITS.rows),
  criterionIds: z.array(z.string().max(200)).max(DRILL_LIMITS.criteria).default([]),
  /** Program ids when the AAR was imported, else the AAR's own corrective action ids. */
  correctiveActionIds: z.array(Id).max(DRILL_LIMITS.list).default([]),
  /**
   * Corrective action id → the criteria (`rowId|criterionId`) its verdict rests on. Taken from the
   * AAR/IP when the drill is drafted, so a run needs neither the AAR nor the source session.
   */
  actionCriteria: z.record(Id, z.array(z.string().max(300)).max(DRILL_LIMITS.criteria)).default({}),
  redlineIds: z.array(Id).max(DRILL_LIMITS.list).default([]),
  /** Plans that should be updated before the drill is run. */
  expectedDocumentIds: z.array(Id).max(DRILL_LIMITS.list).default([]),
  drillScenarioId: Id.optional(),
  runs: z.array(DrillRun).max(DRILL_LIMITS.runs).default([]),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
})
export type Drill = z.infer<typeof Drill>

/**
 * A drill as proposed from a session or edited in the form; nothing is stored until it is saved.
 * `rowIds` may be empty in a proposal (nothing was rated) and must have a row when saved.
 */
export const DrillPlan = z.object({
  formatVersion: z.number().int().default(1),
  title: z.string().min(1).max(300),
  sourceScenarioId: Id,
  sourceSessionId: Id.optional(),
  rowIds: z.array(z.string().max(64)).max(DRILL_LIMITS.rows),
  criterionIds: z.array(z.string().max(200)).max(DRILL_LIMITS.criteria).default([]),
  correctiveActionIds: z.array(Id).max(DRILL_LIMITS.list).default([]),
  actionCriteria: z.record(Id, z.array(z.string().max(300)).max(DRILL_LIMITS.criteria)).default({}),
  redlineIds: z.array(Id).max(DRILL_LIMITS.list).default([]),
  expectedDocumentIds: z.array(Id).max(DRILL_LIMITS.list).default([]),
})
export type DrillPlan = z.infer<typeof DrillPlan>

/**
 * A corrective action's verdict from its linked criteria's ratings: pass when every observed
 * criterion is met, fail when any is not met, else partial. Criteria nobody observed are ignored;
 * when none was observed the verdict is partial (the drill never reached the gap).
 */
export function verdictOf(ratings: readonly Rating[]): { verdict: DrillVerdict; note?: string } {
  const seen = ratings.filter((r) => r !== 'not_observed')
  if (!seen.length) return { verdict: 'partial', note: 'not observed' }
  if (seen.some((r) => r === 'not_met')) return { verdict: 'fail' }
  if (seen.every((r) => r === 'met')) return { verdict: 'pass' }
  return { verdict: 'partial' }
}
