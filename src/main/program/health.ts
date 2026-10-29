// program:health (#438): load the program's own files and run the pure computation. Reads only
// program.json, schedule.json, corrective-actions/ and projects/ snapshots; it never opens a
// project folder. Nothing here uses the network.
import { computeHealth } from '@shared/program/health'
import type { HealthFilter, ProgramHealth } from '@shared/schemas'
import { listAllActions } from './actions'
import { readSnapshots } from './snapshot'
import { loadProgram, loadSchedule } from './store'

export async function loadHealth(
  root: string,
  filter: HealthFilter = {},
  now: Date = new Date(),
): Promise<ProgramHealth> {
  const [program, schedule, snapshots, list] = await Promise.all([
    loadProgram(root),
    loadSchedule(root),
    readSnapshots(root),
    listAllActions(root),
  ])
  return computeHealth(
    { program, schedule: schedule.value, snapshots, actions: list.actions.map((v) => v.action) },
    filter,
    now,
  )
}
