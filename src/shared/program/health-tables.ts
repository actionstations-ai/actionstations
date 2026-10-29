// The dashboard's tables as plain header + rows (#438, FR-11): the PDF and the CSV files print
// exactly these, so the numbers in a board report can be checked against the screen.
import {
  CORRECTIVE_ACTION_STATUS_LABELS,
  CORRECTIVE_ACTION_STATUSES,
  EXERCISE_TYPE_LABELS,
} from '../schemas/program'
import type { ProgramHealth } from '../schemas/program-health'

export interface HealthTable {
  /** CSV file name without extension. */
  id: 'capabilities' | 'sections' | 'corrective-actions' | 'never-tested' | 'timeline'
  title: string
  header: string[]
  rows: string[][]
}

export const STATUS_LABELS = {
  never: 'Never exercised',
  stale: 'Stale',
  current: 'Current',
  planned: 'Planned only',
} as const

const day = (iso?: string): string => (iso ? iso.slice(0, 10) : '')
const n = (v: number | undefined): string => (v === undefined ? '' : String(v))

/** "2026-Q2" shown as "26Q2". */
export const shortQuarter = (q: string): string => `${q.slice(2, 4)}${q.slice(5)}`

function capabilitiesTable(h: ProgramHealth): HealthTable {
  return {
    id: 'capabilities',
    title: 'Core Capabilities by quarter',
    header: [
      'Capability',
      'Status',
      'Last exercised',
      'Exercises in cycle',
      ...h.cycle.quarters.map(shortQuarter),
      'Met',
      'Partially met',
      'Not met',
      'Not observed',
      'Open actions',
      'Overdue actions',
    ],
    rows: h.capabilities.map((c) => [
      c.label,
      STATUS_LABELS[c.status],
      day(c.lastExercisedAt),
      String(c.inCycle),
      ...h.cycle.quarters.map((q) =>
        c.byQuarter[q] ? String(c.byQuarter[q]) : c.plannedByQuarter[q] ? 'planned' : '',
      ),
      n(c.results?.met),
      n(c.results?.partial),
      n(c.results?.notMet),
      n(c.results?.notObserved),
      String(c.openActions),
      String(c.overdueActions),
    ]),
  }
}

function sectionsTable(h: ProgramHealth): HealthTable {
  return {
    id: 'sections',
    title: 'Plan sections',
    header: [
      'Document',
      'Section',
      'Depth',
      'Times cited',
      'Last cited',
      'Open actions',
      'Redlines',
      'Status',
    ],
    rows: h.sections.map((s) => [
      s.documentTitle,
      s.headingPath,
      String(s.depth),
      String(s.timesCited),
      day(s.lastCitedAt),
      String(s.openActions),
      n(s.redlines),
      s.never ? 'Never cited' : 'Cited',
    ]),
  }
}

function actionsTable(h: ProgramHealth): HealthTable {
  const a = h.actions
  const rows: string[][] = []
  for (const s of CORRECTIVE_ACTION_STATUSES)
    rows.push(['Status', CORRECTIVE_ACTION_STATUS_LABELS[s], String(a.byStatus[s]), '', ''])
  rows.push(['Ageing of open actions', 'Under 90 days', String(a.ageing.under90), '', ''])
  rows.push(['Ageing of open actions', '90 to 365 days', String(a.ageing.d90to365), '', ''])
  rows.push(['Ageing of open actions', 'Over 365 days', String(a.ageing.over365), '', ''])
  rows.push(['Verified in this cycle', '', String(a.verifiedInCycle), '', ''])
  for (const c of a.byCapability)
    rows.push(['Capability', c.label, String(c.open), String(c.overdue), `${c.verified} verified`])
  for (const o of a.byOwnerOrg)
    rows.push(['Organization', o.organization, String(o.open), String(o.overdue), ''])
  for (const o of a.overdue)
    rows.push([
      'Overdue action',
      `${o.label} ${o.title}`,
      '',
      '',
      [`due ${o.dueDate}`, `${o.daysOverdue} days overdue`, o.owner, o.organization]
        .filter(Boolean)
        .join('; '),
    ])
  return {
    id: 'corrective-actions',
    title: 'Corrective actions',
    header: ['Group', 'Item', 'Count or open', 'Overdue', 'Detail'],
    rows,
  }
}

function neverTestedTable(h: ProgramHealth): HealthTable {
  const t = h.neverTested
  return {
    id: 'never-tested',
    title: 'Never tested',
    header: ['Kind', 'Item', 'Detail'],
    rows: [
      ...t.capabilities.map((c) => [
        'Capability named by a priority',
        c.label,
        c.priorityIds.length === 1 ? '1 priority' : `${c.priorityIds.length} priorities`,
      ]),
      ...t.documents.map((d) => [
        'Document never cited',
        d.documentTitle,
        d.projectNames.join('; '),
      ]),
      ...t.sections.map((s) => ['Plan section never cited', s.headingPath, s.documentTitle]),
      ...t.overduePlanned.map((p) => [
        'Planned exercise past its quarter',
        p.title,
        `${EXERCISE_TYPE_LABELS[p.type]}, ${p.when}`,
      ]),
    ],
  }
}

function timelineTable(h: ProgramHealth): HealthTable {
  const kind = { exercise: 'Exercise', planned: 'Planned', drill: 'Drill run' } as const
  return {
    id: 'timeline',
    title: 'Timeline',
    header: ['Quarter', 'Kind', 'Title', 'Type', 'Core Capabilities', 'Detail'],
    rows: h.timeline.map((t) => [
      t.quarter,
      kind[t.kind],
      t.title,
      t.type ? EXERCISE_TYPE_LABELS[t.type] : '',
      String(t.capabilities),
      t.drill ? `pass ${t.drill.pass}, partial ${t.drill.partial}, fail ${t.drill.fail}` : '',
    ]),
  }
}

export function healthTables(h: ProgramHealth): HealthTable[] {
  return [
    capabilitiesTable(h),
    sectionsTable(h),
    actionsTable(h),
    neverTestedTable(h),
    timelineTable(h),
  ]
}
