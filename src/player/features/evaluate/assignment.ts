/**
 * The evaluator's assignment (spec 0416): the EEG critical tasks the controller sent, grouped
 * and filtered for the form. Pure helpers; the page holds the state in `EvaluatorFeature`.
 */
import { capabilityName } from '../../../shared/core-capabilities'
import type { EvalAssignPayload } from '../../../shared/live/schemas'

export type Assignment = EvalAssignPayload
export type AssignedTask = Assignment['tasks'][number]

/** The group the controller puts each inject's own expected action under. */
export const EXPECTED_GROUP = 'expected-actions'

/** A newer revision of the same assignment replaces it; an older or repeated one changes nothing. */
export function applyAssignment(current: Assignment | undefined, next: Assignment): Assignment {
  if (!current || current.assignmentId !== next.assignmentId) return next
  return next.revision > current.revision ? next : current
}

export function groupName(capability: string): string {
  return capability === EXPECTED_GROUP ? 'Expected actions' : capabilityName(capability)
}

export interface CapabilityGroup {
  capability: string
  name: string
  tasks: AssignedTask[]
}

/** Capabilities in the order they first appear, each with its tasks in EEG order. */
export function groupByCapability(tasks: readonly AssignedTask[]): CapabilityGroup[] {
  const groups = new Map<string, CapabilityGroup>()
  for (const task of tasks) {
    const group = groups.get(task.capability) ?? {
      capability: task.capability,
      name: groupName(task.capability),
      tasks: [],
    }
    group.tasks.push(task)
    groups.set(task.capability, group)
  }
  return [...groups.values()]
}

/** Empty lists watch everything; otherwise a task matches by its role or its capability. */
export function matchesWatch(task: AssignedTask, watch: Assignment['watch']): boolean {
  if (watch.roleIds.length === 0 && watch.capabilities.length === 0) return true
  return (
    (task.expectedBy !== undefined && watch.roleIds.includes(task.expectedBy)) ||
    watch.capabilities.includes(task.capability)
  )
}

export type TaskFilter = 'mine' | 'all' | 'unrated' | 'due'

export interface FilterContext {
  watch: Assignment['watch']
  /** Task ids that have a rating. */
  rated: ReadonlySet<string>
  /** Task ids in the Watch-for strip. */
  due: ReadonlySet<string>
}

export function filterTasks(
  tasks: readonly AssignedTask[],
  filter: TaskFilter,
  ctx: FilterContext,
): AssignedTask[] {
  switch (filter) {
    case 'all':
      return [...tasks]
    case 'unrated':
      return tasks.filter((t) => !ctx.rated.has(t.id))
    case 'due':
      return tasks.filter((t) => ctx.due.has(t.id))
    default:
      return tasks.filter((t) => matchesWatch(t, ctx.watch))
  }
}

export interface ReleasedRow {
  rowId: string
  releaseId: string
  /** Exercise time label of the release ("1:15"). */
  time: string
  /** Epoch ms the release arrived, to find the most recent. */
  ts: number
}

export interface WatchForEntry {
  row: ReleasedRow
  tasks: AssignedTask[]
}

/**
 * Tasks to watch for after each release, until rated or dismissed (FR-4): one entry per
 * released row that names at least one open task, newest release first.
 */
export function watchFor(
  tasks: readonly AssignedTask[],
  released: readonly ReleasedRow[],
  rated: ReadonlySet<string>,
  dismissed: ReadonlySet<string>,
): WatchForEntry[] {
  const out: WatchForEntry[] = []
  for (const row of [...released].sort((a, b) => b.ts - a.ts)) {
    if (dismissed.has(row.rowId)) continue
    const open = tasks.filter((t) => t.rowIds.includes(row.rowId) && !rated.has(t.id))
    if (open.length) out.push({ row, tasks: open })
  }
  return out
}

/** The most recently released row among a task's rows, for the "Inject" field's default. */
export function latestReleasedRow(
  task: AssignedTask,
  released: readonly ReleasedRow[],
): string | undefined {
  const mine = released.filter((r) => task.rowIds.includes(r.rowId))
  return mine.sort((a, b) => b.ts - a.ts)[0]?.rowId
}
