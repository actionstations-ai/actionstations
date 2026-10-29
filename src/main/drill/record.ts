// Recording a drill run (#431, FR-10, FR-11): the latest rating per criterion of the drill
// scenario, a verdict per corrective action, and the plans' hashes at run time, appended to the
// drill. With a linked program, the verdicts are written to its corrective actions on the
// user's click: a pass verifies the action, anything else is kept as an attempt.
import {
  verdictOf,
  type CorrectiveActionVerification,
  type Drill,
  type DrillRun,
} from '@shared/schemas'
import { buildExerciseRecord } from '../aar/record'
import { loadProject } from '../project/store'
import { addVerification, changeStatus, getAction } from '../program/actions'
import { newId, nowIso } from '../lib/ids'
import { AppError } from '../lib/errors'
import { supersessionMap } from './citations'
import { latestRatings, ratingKey, type RatedCriterion } from './ratings'
import { appendRun, getDrill, saveDrill } from './store'

/** Verdict per corrective action from the ratings of its criteria (all criteria when none are linked). */
export function actionVerdicts(
  drill: Pick<Drill, 'correctiveActionIds' | 'actionCriteria'>,
  rated: readonly RatedCriterion[],
): DrillRun['correctiveActions'] {
  const byKey = new Map(rated.map((r) => [ratingKey(r.rowId, r.criterionId), r.rating]))
  return drill.correctiveActionIds.map((id) => {
    const keys = drill.actionCriteria[id] ?? []
    const mine = keys.flatMap((k) => byKey.get(k) ?? [])
    const { verdict, note } = verdictOf(
      mine.length || keys.length ? mine : rated.map((r) => r.rating),
    )
    return { id, verdict, ...(note ? { note } : {}) }
  })
}

/** documentId → sha256 of the plans the drill expects, and of the versions that replaced them. */
async function documentHashes(root: string, drill: Drill): Promise<Record<string, string>> {
  const project = await loadProject(root)
  const newest = supersessionMap(project.documents)
  const ids = new Set(drill.expectedDocumentIds.flatMap((id) => [id, newest.get(id)?.id ?? id]))
  const out: Record<string, string> = {}
  for (const d of project.documents) if (ids.has(d.id) && d.sha256) out[d.id] = d.sha256
  return out
}

/** Read the drill scenario's ratings and append a run to the drill. */
export async function recordDrillRun(
  root: string,
  drillId: string,
  sessionId?: string,
): Promise<Drill> {
  const drill = await getDrill(root, drillId)
  if (!drill.drillScenarioId)
    throw new AppError('VALIDATION', 'Build the drill scenario and run it before recording a run')
  const { scenario, record } = await buildExerciseRecord(
    root,
    drill.drillScenarioId,
    sessionId ? { sessionId } : {},
  )
  const rated = latestRatings(scenario, record.observations)
  const live = sessionId ?? record.liveSessionId
  const run: DrillRun = {
    id: newId(),
    ...(live ? { sessionId: live } : {}),
    ranAt: nowIso(),
    documentHashes: await documentHashes(root, drill),
    criteria: rated,
    correctiveActions: actionVerdicts(drill, rated),
    programRecorded: false,
  }
  return appendRun(root, drill.id, run)
}

/** Write a run's verdicts to the program's corrective actions; actions not in it are skipped. */
export async function recordInProgram(
  programRoot: string,
  root: string,
  drillId: string,
  runId: string,
): Promise<Drill> {
  const drill = await getDrill(root, drillId)
  const run = drill.runs.find((r) => r.id === runId)
  if (!run) throw new AppError('NOT_FOUND', 'That drill run is not recorded')
  const project = await loadProject(root)
  const at = nowIso()
  for (const { id, verdict } of run.correctiveActions) {
    const action = await getAction(programRoot, id).catch(() => undefined)
    if (!action) continue
    const verification: CorrectiveActionVerification = {
      method: 'drill',
      at,
      result: verdict,
      projectId: project.id,
      ...(drill.drillScenarioId ? { scenarioId: drill.drillScenarioId } : {}),
      drillRunId: run.id,
      note: `Regression drill: ${drill.title}`,
    }
    if (verdict === 'pass' && action.action.status !== 'verified')
      await changeStatus(programRoot, [id], 'verified', '', verification)
    else await addVerification(programRoot, [id], verification)
  }
  return saveDrill(root, {
    ...drill,
    runs: drill.runs.map((r) => (r.id === runId ? { ...r, programRecorded: true } : r)),
  })
}
