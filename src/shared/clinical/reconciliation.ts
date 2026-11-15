// Reconciliation play (spec 0451 FR-12, issue #880). After recovery, units back-enter from paper.
// Units report progress through the "Report reconciliation progress" decision form; this turns
// those decisions into the progress figure's data and releases the seeded discrepancies as the
// work advances, each as an inject prompt the facilitator can deliver ("two patients share a
// record number"). The exercise ends when the facilitator closes reconciliation. Pure: no Node
// imports, no clock; the decisions are plain data.
import type { Discrepancy } from './downtime'
import type { SyntheticPatient } from './synthetic'

/** A recorded decision, as the session log gives it (form id = kind). */
export interface PlayDecision {
  kind: string
  time: string
  fields: Record<string, unknown>
}

export interface UnitProgress {
  unit: string
  done: number
  remaining: number
  discrepanciesFound: number
  at: string
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
const ms = (iso: string): number => Date.parse(iso)

/** The latest report per unit, in the order units first reported. */
export function progressFromDecisions(decisions: readonly PlayDecision[]): UnitProgress[] {
  const out = new Map<string, UnitProgress>()
  const sorted = decisions
    .filter((d) => d.kind === 'reconcile_unit' && typeof d.fields.unit === 'string')
    .sort((a, b) => ms(a.time) - ms(b.time))
  for (const d of sorted) {
    const unit = String(d.fields.unit).trim()
    if (!unit) continue
    out.set(unit, {
      unit,
      done: num(d.fields.done),
      remaining: num(d.fields.remaining),
      discrepanciesFound: num(d.fields.discrepancies),
      at: d.time,
    })
  }
  return [...out.values()]
}

export const isClosed = (decisions: readonly PlayDecision[]): boolean =>
  decisions.some((d) => d.kind === 'close_reconciliation')

/** Overall percent complete (0 to 100); 0 before any unit has reported. */
export function percentComplete(progress: readonly UnitProgress[]): number {
  const done = progress.reduce((a, u) => a + u.done, 0)
  const total = done + progress.reduce((a, u) => a + u.remaining, 0)
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

/** Data for the `reconciliation_progress` figure kind. */
export function progressFigureData(
  progress: readonly UnitProgress[],
  title = 'Reconciliation progress',
) {
  return {
    title,
    unit: 'items',
    units: progress.map((u) => ({ name: u.unit, done: u.done, remaining: u.remaining })),
  }
}

// ---- back-entry scope ------------------------------------------------------------------------
// What is entered as coded data after recovery and what is scanned, by downtime length. The
// SAFER Contingency Planning guide (2025, practice 1.3) asks for paper on every unit for at least
// 8 hours of care and a process that enters orders as coded data and scans paper whose contents
// are not otherwise entered; ASPR TRACIE and the HSCC checklist ask hospitals to decide early what
// is entered and what is not. No federal source sets the cut-off, so the default is the 8 hours
// SAFER uses for the paper supply, and the scenario author can change it.

/** Downtimes up to this many hours are back-entered in full. */
export const FULL_BACK_ENTRY_HOURS = 8

export interface BackEntryScope {
  durationHours: number
  fullBackEntryHours: number
  /** True when the whole paper record is entered as discrete data. */
  full: boolean
  /** Entered as coded data whatever the downtime length. */
  always: string[]
  /** Also entered as coded data at this length. */
  enter: string[]
  /** Scanned and indexed to the patient instead of re-entered. */
  scan: string[]
  /** Checks required after every downtime, before units leave paper. */
  reconcile: string[]
}

const ALWAYS_ENTERED = [
  'Every downtime registration, matched to the master patient index',
  'Active orders, entered as coded orders',
  'Allergies recorded or changed on paper',
]

const RECONCILIATION_CHECKS = [
  'Patient identity: each temporary record number merged or confirmed',
  'Medications: a pharmacist verifies every active medication order written on paper before the pharmacy profile and the eMAR go live',
  'Results: each result phoned or printed during the downtime checked against the result filed in the chart, critical results first',
]

/** The default back-entry scope for a downtime of this length. */
export function backEntryScope(
  durationHours: number,
  fullBackEntryHours: number = FULL_BACK_ENTRY_HOURS,
): BackEntryScope {
  const full = durationHours <= fullBackEntryHours
  return {
    durationHours,
    fullBackEntryHours,
    full,
    always: ALWAYS_ENTERED,
    enter: full
      ? [
          'All paper documentation as discrete data: medication administrations, vital signs, intake and output, assessments and notes',
        ]
      : [
          'The last administration of each active medication, so the next dose is timed from it',
          'The latest vital signs and assessment for each patient',
        ],
    scan: full
      ? []
      : [
          'The rest of the paper record (earlier administrations, flowsheets and notes), scanned and indexed to the patient',
        ],
    reconcile: RECONCILIATION_CHECKS,
  }
}

/** Percent complete at which the first seeded discrepancy surfaces. */
export const FIRST_RELEASE_PERCENT = 10
/** Percent complete by which the last seeded discrepancy has surfaced. */
export const LAST_RELEASE_PERCENT = 80

/**
 * The percent complete at which discrepancy `index` of `count` surfaces, spread evenly from
 * 10 to 80 percent. Duplicate registrations surface first because matching downtime
 * registrations is the first recovery step; the last discrepancy lands while a fifth of the
 * back-entry is still open, so players have time to act before reconciliation is closed. These
 * percentages pace the exercise; they are not clinical thresholds.
 */
export function releaseThreshold(index: number, count: number): number {
  const span = LAST_RELEASE_PERCENT - FIRST_RELEASE_PERCENT
  if (count <= 1) return FIRST_RELEASE_PERCENT
  return FIRST_RELEASE_PERCENT + Math.round((index * span) / (count - 1))
}

export interface DiscrepancyInject {
  discrepancy: Discrepancy
  /** The percent complete at which it became due. */
  threshold: number
  /** What the facilitator reads out or hands over. */
  text: string
}

const label = (p: SyntheticPatient | undefined): string =>
  p ? `${p.family}, ${p.given} (MRN ${p.mrn})` : 'a patient'

/** The inject text for a discrepancy, naming the synthetic patients it concerns. */
export function discrepancyText(d: Discrepancy, patients: readonly SyntheticPatient[]): string {
  const [a, b] = d.patients.map((i) => patients[i])
  switch (d.kind) {
    case 'duplicate_record':
      return `Registration reports that ${label(a)} now has two records, one created during downtime. Which one is the legal record, and who merges them?`
    case 'wrong_patient_result':
      return `The laboratory says a result filed to ${label(a)} belongs to ${label(b)}. The result is already visible in the chart. What happens now?`
    case 'order_sent_twice':
      return `A paper order for ${label(a)} was also entered after recovery and has been sent twice. Has anything been given or collected twice?`
  }
}

/**
 * The discrepancies that are due at this progress and have not been released: those whose
 * threshold the percent complete has reached, in order. `released` holds ids already delivered.
 * Nothing is due once reconciliation is closed.
 */
export function dueDiscrepancies(
  discrepancies: readonly Discrepancy[],
  progress: readonly UnitProgress[],
  released: ReadonlySet<string>,
  patients: readonly SyntheticPatient[],
  closed = false,
): DiscrepancyInject[] {
  if (closed) return []
  const percent = percentComplete(progress)
  return discrepancies
    .map((discrepancy, i) => ({
      discrepancy,
      threshold: releaseThreshold(i, discrepancies.length),
    }))
    .filter((x) => !released.has(x.discrepancy.id) && percent >= x.threshold)
    .map((x) => ({ ...x, text: discrepancyText(x.discrepancy, patients) }))
}

/** The discrepancy list as table rows for the facilitator: id, kind, patients, status. */
export function discrepancyRows(
  discrepancies: readonly Discrepancy[],
  released: ReadonlySet<string>,
  patients: readonly SyntheticPatient[],
): string[][] {
  return discrepancies.map((d) => [
    d.id,
    d.kind.replace(/_/g, ' '),
    d.patients.map((i) => label(patients[i])).join(' and '),
    released.has(d.id) ? 'delivered' : 'not yet due',
  ])
}
