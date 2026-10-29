// The branching log (spec 0430 FR-8, FR-9): decisions, releases and proposal verdicts of a run
// go to a local-only session log, scenarios/<id>/live/local/log.jsonl, in the format of the
// live session log (spec 0417). The app writes the hash of the replayed state beside it each
// time, so "Replay check" can tell a changed scenario or an edited log from an untouched run.
import { replay, replayCheck, scenarioHash, stateHash } from '@shared/branching/replay'
import type { BranchingLogInput, BranchingReplayResult } from '@shared/ipc/facilitator'
import type { SessionLogEntry } from '@shared/schemas/live'
import { z } from 'zod'
import { readJsonOr, safeJoin, writeJsonAtomic } from '../lib/fs'
import { LogWriter, readEntries } from '../live/log'
import { getScenario } from '../scenario/store'
import { scenarioLayout } from '../scenario/layout'

const LocalState = z.object({ stateHash: z.string(), scenarioHash: z.string() })

const localDir = (root: string, scenarioId: string) =>
  safeJoin(scenarioLayout(root, scenarioId).dir, 'live', 'local')

async function readAll(path: string): Promise<SessionLogEntry[]> {
  const out: SessionLogEntry[] = []
  for await (const e of readEntries(path)) out.push(e)
  return out
}

/** Appends entries and records the hashes of the state they lead to. */
export async function appendBranchingEntries(
  root: string,
  scenarioId: string,
  entries: BranchingLogInput[],
): Promise<{ stateHash: string; scenarioHash: string }> {
  const dir = localDir(root, scenarioId)
  const logPath = safeJoin(dir, 'log.jsonl')
  const writer = await LogWriter.open(logPath, 'role')
  for (const e of entries)
    await writer.append({
      kind: e.kind,
      actor: { kind: 'controller' },
      ...(e.ex ? { ex: e.ex } : {}),
      ...(e.rowId ? { ref: { rowId: e.rowId } } : {}),
      data: e.data,
    })
  const scenario = await getScenario(root, scenarioId)
  const hashes = {
    stateHash: stateHash(replay(scenario, await readAll(logPath))),
    scenarioHash: scenarioHash(scenario),
  }
  await writeJsonAtomic(safeJoin(dir, 'state.json'), hashes)
  return hashes
}

/** Replays the local log against the scenario as it is now. */
export async function checkBranchingReplay(
  root: string,
  scenarioId: string,
): Promise<BranchingReplayResult> {
  const dir = localDir(root, scenarioId)
  const entries = await readAll(safeJoin(dir, 'log.jsonl'))
  if (!entries.length)
    return { status: 'no_log', message: 'Nothing has been recorded for this run yet.' }
  const stored = await readJsonOr<z.ZodType<z.infer<typeof LocalState> | undefined>>(
    safeJoin(dir, 'state.json'),
    LocalState.or(z.undefined()),
    () => undefined,
  )
  const scenario = await getScenario(root, scenarioId)
  if (stored && stored.scenarioHash !== scenarioHash(scenario))
    return {
      status: 'scenario_changed',
      message: 'The scenario changed after this run, so it cannot be replayed exactly.',
    }
  const check = replayCheck(scenario, entries, stored?.stateHash)
  if (check.status === 'matches')
    return { status: 'matches', message: 'Replay matches the recorded run.', stateHash: check.hash }
  if (check.status === 'no_decisions')
    return { status: 'no_decisions', message: 'No decisions were recorded.', stateHash: check.hash }
  return {
    status: 'mismatch',
    message: check.firstDivergence?.reason ?? 'The replayed state differs from the recorded run.',
    stateHash: check.hash,
    ...(check.firstDivergence ? { firstDivergence: check.firstDivergence } : {}),
  }
}
