// Sorting and counting for the corrective actions table (pure, so it is tested without a DOM).
import { capabilityName } from '@shared/core-capabilities'
import { isOverdue } from '@shared/program/status'
import {
  CORRECTIVE_ACTION_STATUSES,
  type CorrectiveActionStatus,
  type CorrectiveActionView,
} from '@shared/schemas'

export type SortKey = 'number' | 'title' | 'capability' | 'owner' | 'due' | 'status'
export type SortDir = 'asc' | 'desc'

const STATUS_ORDER = new Map(CORRECTIVE_ACTION_STATUSES.map((s, i) => [s, i]))

/** An action with no due date sorts as the latest date. */
function compare(a: CorrectiveActionView, b: CorrectiveActionView, key: SortKey): number {
  const x = a.action
  const y = b.action
  switch (key) {
    case 'number':
      return (x.number ?? Infinity) - (y.number ?? Infinity)
    case 'title':
      return x.title.localeCompare(y.title)
    case 'capability':
      return capabilityName(x.coreCapabilities[0] ?? '').localeCompare(
        capabilityName(y.coreCapabilities[0] ?? ''),
      )
    case 'owner':
      return x.owner.name.localeCompare(y.owner.name)
    case 'due':
      return (x.dueDate ?? '9999').localeCompare(y.dueDate ?? '9999')
    case 'status':
      return (STATUS_ORDER.get(x.status) ?? 0) - (STATUS_ORDER.get(y.status) ?? 0)
  }
}

export function sortActions(
  views: CorrectiveActionView[],
  key: SortKey,
  dir: SortDir,
): CorrectiveActionView[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...views].sort((a, b) => sign * compare(a, b, key) || compare(a, b, 'number'))
}

export interface ActionCounts {
  total: number
  overdue: number
  byStatus: Record<CorrectiveActionStatus, number>
}

export function countActions(views: CorrectiveActionView[], today: string): ActionCounts {
  const byStatus = Object.fromEntries(CORRECTIVE_ACTION_STATUSES.map((s) => [s, 0])) as Record<
    CorrectiveActionStatus,
    number
  >
  let overdue = 0
  for (const { action } of views) {
    byStatus[action.status]++
    if (isOverdue(action, today)) overdue++
  }
  return { total: views.length, overdue, byStatus }
}

export const todayIso = (): string => new Date().toISOString().slice(0, 10)

export function ownerNames(views: CorrectiveActionView[]): string[] {
  return [...new Set(views.map((v) => v.action.owner.name).filter(Boolean))].sort()
}
