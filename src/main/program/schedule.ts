// The IPP schedule (FR-8, FR-9): schedule.json with the same revision-conflict rule as the
// corrective actions, and the rule that a planned exercise linked to a scenario shows as completed
// once the scenario was exercised.
import { Schedule, type ProjectSnapshot } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { writeFileAtomic } from '../lib/fs'
import {
  announce,
  jsonText,
  loadSchedule,
  programPaths,
  revisionOf,
  withProgramLock,
} from './store'

export async function saveSchedule(
  root: string,
  schedule: Schedule,
  baseRevision?: string,
): Promise<{ schedule: Schedule; revision: string }> {
  const parsed = Schedule.parse(schedule)
  const saved = await withProgramLock(root, async () => {
    const current = await loadSchedule(root)
    if (current.revision !== 'new' && baseRevision !== current.revision)
      throw new AppError('CONFLICT', 'The schedule was changed by someone else.', {
        theirs: { schedule: current.value, revision: current.revision },
      })
    const text = jsonText(parsed)
    await writeFileAtomic(programPaths(root).schedule, text)
    return { schedule: parsed, revision: revisionOf(text) }
  })
  announce(root, 'schedule')
  return saved
}

/** The exercise date a linked scenario's snapshot reports, as YYYY-MM-DD. */
function exercisedDate(snapshots: ProjectSnapshot[], projectId: string, scenarioId: string) {
  const at = snapshots
    .find((s) => s.projectId === projectId)
    ?.scenarios.find((sc) => sc.scenarioId === scenarioId)?.exercisedAt
  return at?.slice(0, 10)
}

/** Mark planned exercises completed when their linked scenario has been run. Pure. */
export function completedFromSnapshots(schedule: Schedule, snapshots: ProjectSnapshot[]): Schedule {
  let changed = false
  const exercises = schedule.exercises.map((e) => {
    if (!e.projectId || !e.scenarioId || e.status === 'cancelled') return e
    const date = exercisedDate(snapshots, e.projectId, e.scenarioId)
    if (!date || (e.status === 'completed' && e.completedAt === date)) return e
    changed = true
    return { ...e, status: 'completed' as const, completedAt: date }
  })
  return changed ? { ...schedule, exercises } : schedule
}

/** Write schedule.json when the snapshots complete something new. */
export async function markCompletedFromSnapshots(
  root: string,
  snapshots: ProjectSnapshot[],
): Promise<boolean> {
  const current = await loadSchedule(root)
  const next = completedFromSnapshots(current.value, snapshots)
  if (next === current.value) return false
  await saveSchedule(root, next, current.revision)
  return true
}
