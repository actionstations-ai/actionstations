// Observations recorded outside live play (#421): the facilitator rating criteria from the
// Facilitate screen, or paper EEGs typed up afterwards, stored beside the scenario as
// scenarios/<id>/evaluation.json. Live-play observations (#416) arrive in the session log; the
// AAR (#419) reads both through one record builder.
import { EvaluationRecord, type Observation } from '@shared/schemas'
import { nowIso } from '../lib/ids'
import { readJsonOr, safeJoin, writeJsonAtomic } from '../lib/fs'
import { requireScenarioDir } from '../scenario/store'

const FILE = 'evaluation.json'

/** Absolute path of the record; throws NOT_FOUND when the scenario does not exist. */
export async function evaluationPath(root: string, scenarioId: string): Promise<string> {
  const layout = await requireScenarioDir(root, scenarioId)
  return safeJoin(layout.dir, FILE)
}

export const emptyEvaluationRecord = (): EvaluationRecord =>
  EvaluationRecord.parse({ observations: [], updatedAt: nowIso() })

export async function readEvaluation(root: string, scenarioId: string): Promise<EvaluationRecord> {
  return readJsonOr(await evaluationPath(root, scenarioId), EvaluationRecord, () =>
    emptyEvaluationRecord(),
  )
}

// Saves for one file run one at a time so a slow write never lands after a newer one.
const queues = new Map<string, Promise<unknown>>()

/** Read-modify-write under the file's queue, so two quick ratings both land. */
async function updateEvaluation(
  root: string,
  scenarioId: string,
  change: (record: EvaluationRecord) => EvaluationRecord,
): Promise<EvaluationRecord> {
  // Join the queue synchronously, before any await, so saves land in call order.
  const key = `${root}\0${scenarioId}`
  const prev = queues.get(key) ?? Promise.resolve()
  const run = prev
    .catch(() => undefined)
    .then(async () => {
      const path = await evaluationPath(root, scenarioId)
      const current = await readJsonOr(path, EvaluationRecord, () => emptyEvaluationRecord())
      const next = EvaluationRecord.parse({ ...change(current), updatedAt: nowIso() })
      await writeJsonAtomic(path, next)
      return next
    })
  queues.set(key, run)
  try {
    return await run
  } finally {
    if (queues.get(key) === run) queues.delete(key)
  }
}

/** Insert or replace (by id) one observation. */
export function upsertObservation(
  root: string,
  scenarioId: string,
  observation: Observation,
): Promise<EvaluationRecord> {
  return updateEvaluation(root, scenarioId, (record) => {
    const observations = record.observations.filter((o) => o.id !== observation.id)
    return { ...record, observations: [...observations, observation] }
  })
}

export function removeObservation(
  root: string,
  scenarioId: string,
  observationId: string,
): Promise<EvaluationRecord> {
  return updateEvaluation(root, scenarioId, (record) => ({
    ...record,
    observations: record.observations.filter((o) => o.id !== observationId),
  }))
}
