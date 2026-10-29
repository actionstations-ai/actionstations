// The evaluation data the HSEEP documents print (#420): mission areas, Core Capabilities per
// objective, the Exercise Evaluation Guides and their critical tasks, read from the scenario's
// evaluation block (#421, src/shared/schemas/evaluation.ts). The HSEEP documents and the Excel
// MSEL read only ExportEvaluation. A scenario without evaluation guides gets undefined, and the
// documents print fill-in lines and "not prepared yet" notes where EEG content belongs.
import {
  capabilityName,
  coreCapability,
  MISSION_AREA_LABELS,
  MISSION_AREAS,
  type MissionArea,
} from '@shared/core-capabilities'
import type { Scenario } from '@shared/schemas'
import { RATING_LABELS, type Evaluation } from '@shared/schemas/evaluation'

export interface ExportCriticalTask {
  id: string
  text: string
  /** MSEL row ids whose expected action shows the task. */
  rowIds: string[]
  /** Objective ids the task itself names (else its EEG's). */
  objectiveIds?: string[]
}

export interface ExportEeg {
  /** Core Capability name, e.g. "Operational Coordination". */
  capability: string
  /** Objective ids the EEG evaluates. */
  objectiveIds: string[]
  criticalTasks: ExportCriticalTask[]
}

export interface ExportEvaluation {
  /** HSEEP mission areas (Prevention, Protection, Mitigation, Response, Recovery). */
  missionAreas: string[]
  /** Core Capability names per objective id. */
  objectiveCapabilities: Record<string, string[]>
  eegs: ExportEeg[]
  /** Rating scale lines for the evaluator instructions ("P: Performed without challenges"). */
  ratingScale: string[]
}

/** HSEEP rating scale as the evaluation guides (#421) rate observations. */
export const RATING_SCALE = [
  `${RATING_LABELS.met}: the critical task was performed as the plan expects.`,
  `${RATING_LABELS.partial}: the task was performed with challenges or only in part.`,
  `${RATING_LABELS.not_met}: the task was not performed in a way that met the objective.`,
  `${RATING_LABELS.not_observed}: the task did not come up while the evaluator watched.`,
]

/**
 * Mission areas from the exercised capabilities. The common capabilities (Planning, Public
 * Information and Warning, Operational Coordination) span all five and say nothing; only the
 * others count. Empty when every capability is a common one.
 */
function missionAreas(ids: string[]): string[] {
  const areas = new Set<MissionArea>()
  for (const id of ids) {
    const c = coreCapability(id)
    if (c && c.areas.length < MISSION_AREAS.length) c.areas.forEach((a) => areas.add(a))
  }
  return MISSION_AREAS.filter((a) => areas.has(a)).map((a) => MISSION_AREA_LABELS[a])
}

function taskText(t: Evaluation['eegs'][number]['criticalTasks'][number]): string {
  return t.timing ? `${t.task} (${t.timing})` : t.task
}

/**
 * The scenario's evaluation data in the shape the HSEEP documents read; undefined while the
 * scenario has no capabilities mapped and no evaluation guides.
 */
export function evaluationOf(scenario: Scenario): ExportEvaluation | undefined {
  const ev = scenario.evaluation as Evaluation | undefined
  if (!ev || (!ev.eegs.length && !ev.objectiveCapabilities.length)) return undefined
  const objectiveCapabilities: Record<string, string[]> = {}
  for (const oc of ev.objectiveCapabilities) {
    const names = (objectiveCapabilities[oc.objectiveId] ??= [])
    const name = capabilityName(oc.capability)
    if (!names.includes(name)) names.push(name)
  }
  return {
    missionAreas: missionAreas([
      ...ev.objectiveCapabilities.map((o) => o.capability),
      ...ev.eegs.map((e) => e.capability),
    ]),
    objectiveCapabilities,
    eegs: ev.eegs.map((e) => ({
      capability: capabilityName(e.capability),
      objectiveIds: e.objectiveRefs,
      criticalTasks: e.criticalTasks.map((t) => ({
        id: t.id,
        text: taskText(t),
        rowIds: t.rowIds,
        ...(t.objectiveRefs.length ? { objectiveIds: t.objectiveRefs } : {}),
      })),
    })),
    ratingScale: RATING_SCALE,
  }
}

/** Core Capabilities of one objective (empty when none are known). */
export function capabilitiesFor(
  evaluation: ExportEvaluation | undefined,
  objectiveId: string,
): string[] {
  return evaluation?.objectiveCapabilities[objectiveId] ?? []
}

export interface RowTask {
  capability: string
  objectiveIds: string[]
  task: ExportCriticalTask
}

/** Critical tasks linked to an MSEL row, each with the capability of its EEG. */
export function tasksForRow(evaluation: ExportEvaluation | undefined, rowId: string): RowTask[] {
  return (evaluation?.eegs ?? []).flatMap((eeg) =>
    eeg.criticalTasks
      .filter((t) => t.rowIds.includes(rowId))
      .map((task) => ({
        capability: eeg.capability,
        objectiveIds: task.objectiveIds ?? eeg.objectiveIds,
        task,
      })),
  )
}
