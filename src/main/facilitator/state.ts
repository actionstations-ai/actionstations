// Facilitator session state (#45): exercise clock, delivered injects and hot wash notes,
// stored beside the scenario as scenarios/<id>/facilitator.json.
import { FacilitatorState } from '@shared/ipc/facilitator'
import { readJsonOr, safeJoin, writeJsonAtomic } from '../lib/fs'
import { requireScenarioDir } from '../scenario/store'

const FILE = 'facilitator.json'

/** Absolute path of the state file; throws NOT_FOUND when the scenario does not exist. */
export async function facilitatorStatePath(root: string, scenarioId: string): Promise<string> {
  const layout = await requireScenarioDir(root, scenarioId)
  return safeJoin(layout.dir, FILE)
}

export const emptyFacilitatorState = (): FacilitatorState => FacilitatorState.parse({})

export async function readFacilitatorState(
  root: string,
  scenarioId: string,
): Promise<FacilitatorState> {
  return readJsonOr(await facilitatorStatePath(root, scenarioId), FacilitatorState, () =>
    emptyFacilitatorState(),
  )
}

// Saves for one file run one at a time so a slow write never lands after a newer one.
const queues = new Map<string, Promise<unknown>>()

export async function writeFacilitatorState(
  root: string,
  scenarioId: string,
  state: FacilitatorState,
): Promise<FacilitatorState> {
  const clean = FacilitatorState.parse(state)
  // Join the queue synchronously, before any await, so saves land in call order; the path
  // is resolved inside the queued step.
  const key = `${root}\0${scenarioId}`
  const prev = queues.get(key) ?? Promise.resolve()
  const run = prev
    .catch(() => undefined)
    .then(async () => writeJsonAtomic(await facilitatorStatePath(root, scenarioId), clean))
  queues.set(key, run)
  try {
    await run
  } finally {
    if (queues.get(key) === run) queues.delete(key)
  }
  return clean
}
