// The exercise record (#419, FR-1, FR-2): everything the exercise produced, assembled from the
// scenario folder before the AAR/IP is drafted. Any subset of sources works: a paper exercise
// with a facilitator's notes and a hot wash produces a record whose `sources` say so, and the
// document states which sources were available. Every item carries a stable evidence ref so a
// finding can point at what it rests on.
import type { FacilitatorState } from '@shared/ipc/facilitator'
import { ExerciseRecord, type RecordObservation } from '@shared/schemas/aar'
import type { EvaluationRecord } from '@shared/schemas/evaluation'
import type { Scenario } from '@shared/schemas/scenario'
import type { SurveySummary } from '@shared/schemas/survey'
import { readEvaluation } from '../evaluation/store'
import { readFacilitatorState } from '../facilitator/state'
import { getScenario } from '../scenario/store'
import { evaluationPart } from './sources/evaluation'
import { facilitatorPart, hasFacilitatorEvidence } from './sources/facilitator'
import { livePart, readLiveLog, type LiveLogResult } from './sources/live-log'
import { surveysPart } from './sources/surveys'

export interface RecordParts {
  facilitator?: FacilitatorState
  evaluation?: EvaluationRecord
  live?: LiveLogResult
  surveys?: SurveySummary[]
  warnings?: string[]
}

export interface BuiltRecord {
  scenario: Scenario
  record: ExerciseRecord
}

export interface BuildOptions {
  /** The live session to read; the most recent ended one when absent. */
  sessionId?: string
}

/** Rows delivered in the room and in live play, one entry per row, MSEL order. */
function mergeDelivered(
  scenario: Scenario,
  ...lists: ExerciseRecord['delivered'][]
): ExerciseRecord['delivered'] {
  const order = new Map(scenario.msel.map((r, i) => [r.id, i]))
  const byRow = new Map<string, ExerciseRecord['delivered'][number]>()
  for (const list of lists) for (const d of list) if (!byRow.has(d.rowId)) byRow.set(d.rowId, d)
  return [...byRow.values()].sort(
    (a, b) =>
      (order.get(a.rowId) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.rowId) ?? Number.MAX_SAFE_INTEGER),
  )
}

/** Observations from both files; a live revision of the same id replaces the stored one. */
function mergeObservations(...lists: RecordObservation[][]): RecordObservation[] {
  const byId = new Map<string, RecordObservation>()
  for (const list of lists) for (const o of list) byId.set(o.id, o)
  return [...byId.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
}

/** Assemble the record from whichever parts exist (pure; the file reads are in buildExerciseRecord). */
export function assembleRecord(scenario: Scenario, parts: RecordParts): ExerciseRecord {
  const fac = parts.facilitator ? facilitatorPart(parts.facilitator, scenario) : undefined
  // Live observations are in evaluation.json (latest revision, one schema); the log keeps the
  // revision history, so reading both would count each observation twice (#416).
  const skipObservations = !!parts.evaluation?.observations.some((o) => o.source === 'live')
  const live = parts.live ? livePart(parts.live.entries, scenario, { skipObservations }) : undefined
  const observations = mergeObservations(
    parts.evaluation ? evaluationPart(parts.evaluation) : [],
    live?.observations ?? [],
  )
  const surveys = parts.surveys ?? []
  const warnings = [...(parts.warnings ?? [])]
  if (parts.live?.skipped)
    warnings.push(
      `${parts.live.skipped} line(s) of the live session log could not be read and were skipped.`,
    )
  return ExerciseRecord.parse({
    sources: {
      facilitator: !!parts.facilitator && hasFacilitatorEvidence(parts.facilitator),
      evaluation: observations.some((o) => o.source !== 'live'),
      live: !!parts.live,
      surveys: surveys.length > 0,
    },
    ...(parts.live ? { liveSessionId: parts.live.sessionId } : {}),
    delivered: mergeDelivered(scenario, fac?.delivered ?? [], live?.delivered ?? []),
    notes: [...(fac?.notes ?? []), ...(live?.notes ?? [])],
    hotwash: [...(fac?.hotwash ?? []), ...(live?.hotwash ?? [])],
    decisions: fac?.decisions ?? [],
    observations,
    votes: live?.votes ?? [],
    messages: live?.messages ?? [],
    messageCounts: live?.messageCounts ?? [],
    surveys,
    warnings,
  })
}

/** Read every source the scenario folder has and assemble the record. */
export async function buildExerciseRecord(
  root: string,
  scenarioId: string,
  opts: BuildOptions = {},
): Promise<BuiltRecord> {
  const scenario = await getScenario(root, scenarioId)
  const warnings: string[] = []
  const [facilitator, evaluation, live, surveys] = await Promise.all([
    readFacilitatorState(root, scenarioId),
    readEvaluation(root, scenarioId),
    readLiveLog(root, scenarioId, opts.sessionId).catch((e: unknown) => {
      warnings.push(`The live session log could not be read: ${(e as Error).message}`)
      return undefined
    }),
    surveysPart(root, scenarioId).catch((e: unknown) => {
      warnings.push(`Survey results could not be read: ${(e as Error).message}`)
      return [] as SurveySummary[]
    }),
  ])
  return {
    scenario,
    record: assembleRecord(scenario, { facilitator, evaluation, live, surveys, warnings }),
  }
}
