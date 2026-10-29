// Corrective-action roll-up for the health dashboard (#438, FR-6): counts by status, overdue list,
// ageing buckets, by capability and by owner organization. Owner names are left out of the
// result when `includeOwners` is false (NFR-2).
import { capabilityName } from '../core-capabilities'
import {
  CORRECTIVE_ACTION_STATUSES,
  type CorrectiveActionStatus,
  type ProgramAction,
} from '../schemas/program'
import type { ActionsHealth } from '../schemas/program-health'
import { daysBetween } from './health-time'
import { actionLabel, isActive, isOverdue } from './status'

export interface ActionsContext {
  today: string
  cycle: { startYear: number; years: number }
  includeOwners: boolean
}

const UNASSIGNED = 'Unassigned'

const ownerName = (a: ProgramAction): string | undefined => a.owner.name.trim() || undefined

/** When the action became verified: the last history entry to "verified", else the verification. */
function verifiedAt(a: ProgramAction): string {
  const entry = [...a.history].reverse().find((h) => h.to === 'verified')
  return entry?.at ?? a.verifications.at(-1)?.at ?? a.updatedAt
}

function inCycle(day: string, cycle: ActionsContext['cycle']): boolean {
  const year = Number(day.slice(0, 4))
  return year >= cycle.startYear && year < cycle.startYear + cycle.years
}

function ageingOf(actions: ProgramAction[], today: string): ActionsHealth['ageing'] {
  const ageing = { under90: 0, d90to365: 0, over365: 0 }
  for (const a of actions.filter(isActive)) {
    const age = daysBetween(a.createdAt.slice(0, 10), today)
    if (age < 90) ageing.under90++
    else if (age <= 365) ageing.d90to365++
    else ageing.over365++
  }
  return ageing
}

function byCapability(actions: ProgramAction[], today: string): ActionsHealth['byCapability'] {
  const map = new Map<string, { open: number; overdue: number; verified: number }>()
  for (const a of actions)
    for (const id of a.coreCapabilities) {
      const row = map.get(id) ?? { open: 0, overdue: 0, verified: 0 }
      if (isActive(a)) row.open++
      if (isOverdue(a, today)) row.overdue++
      if (a.status === 'verified') row.verified++
      map.set(id, row)
    }
  return [...map.entries()]
    .map(([id, r]) => ({ id: id as never, label: capabilityName(id), ...r }))
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.label.localeCompare(b.label))
}

function byOwnerOrg(actions: ProgramAction[], today: string): ActionsHealth['byOwnerOrg'] {
  const map = new Map<string, { open: number; overdue: number }>()
  for (const a of actions.filter(isActive)) {
    const org = a.owner.organization.trim() || UNASSIGNED
    const row = map.get(org) ?? { open: 0, overdue: 0 }
    row.open++
    if (isOverdue(a, today)) row.overdue++
    map.set(org, row)
  }
  return [...map.entries()]
    .map(([organization, r]) => ({ organization, ...r }))
    .sort((a, b) => b.open - a.open || a.organization.localeCompare(b.organization))
}

function overdueList(actions: ProgramAction[], ctx: ActionsContext): ActionsHealth['overdue'] {
  return actions
    .filter((a) => isOverdue(a, ctx.today))
    .map((a) => ({
      id: a.id,
      label: actionLabel(a),
      title: a.title,
      dueDate: a.dueDate!,
      daysOverdue: daysBetween(a.dueDate!, ctx.today),
      owner: ctx.includeOwners ? ownerName(a) : undefined,
      organization: a.owner.organization.trim() || UNASSIGNED,
      coreCapabilities: a.coreCapabilities,
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.label.localeCompare(b.label))
}

export function actionsHealth(actions: ProgramAction[], ctx: ActionsContext): ActionsHealth {
  const byStatus = Object.fromEntries(CORRECTIVE_ACTION_STATUSES.map((s) => [s, 0])) as Record<
    CorrectiveActionStatus,
    number
  >
  for (const a of actions) byStatus[a.status]++
  return {
    byStatus,
    overdue: overdueList(actions, ctx),
    ageing: ageingOf(actions, ctx.today),
    byCapability: byCapability(actions, ctx.today),
    byOwnerOrg: byOwnerOrg(actions, ctx.today),
    verifiedInCycle: actions.filter(
      (a) => a.status === 'verified' && inCycle(verifiedAt(a).slice(0, 10), ctx.cycle),
    ).length,
  }
}
