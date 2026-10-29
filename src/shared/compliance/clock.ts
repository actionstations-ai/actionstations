// Regulatory clock maths (#426, spec 0426 FR-4, NFR-4). Pure and deterministic: the facilitate
// screen, the presentation window and the exports all call these, so a deadline is the same
// everywhere. Times are floating scenario times (scenario-time.ts).
//
//   deadline(reg, clockId, anchors) → { dueAt, startedAt, term } | { waiting: [...] }
//   clockStatus(view inputs)        → waiting | running | due_soon | overdue | met | missed | waived
//   clockViews(reg, session, start, nowMin) → every clock of a regulation, ready to show
import {
  CLOCK_REF_PREFIX,
  clockKey,
  type ClockCompletion,
  type ClockTerm,
  type ComplianceSession,
  type Regulation,
} from '../schemas/compliance'
import { addBusinessDays, addMonths } from './calendars'
import { scenarioAt } from './scenario-time'

const MIN_MS = 60_000

export type ClockStatus =
  'waiting' | 'running' | 'due_soon' | 'overdue' | 'met' | 'missed' | 'waived'

/** Share of the clock's span left at which it shows "due soon" (spec FR-7). */
export const DUE_SOON_SHARE = 0.25

/** When each trigger first fired and when each clock was filed, as floating dates. */
export interface ClockAnchors {
  triggers: ReadonlyMap<string, Date>
  completions: ReadonlyMap<string, ClockCompletion & { atDate?: Date }>
}

/** `from` plus a term's duration on the regulation's calendar. */
export function addDuration(from: Date, term: ClockTerm, calendar: Regulation['calendar']): Date {
  switch (term.unit) {
    case 'minutes':
      return new Date(from.getTime() + term.amount * MIN_MS)
    case 'hours':
      return new Date(from.getTime() + term.amount * 60 * MIN_MS)
    case 'calendar_days':
      return new Date(from.getTime() + term.amount * 1440 * MIN_MS)
    case 'business_days':
      return addBusinessDays(from, term.amount, calendar)
    case 'months':
      return addMonths(from, term.amount)
  }
}

/** The instant a term counts from: its trigger's first firing, or the referenced clock's filing. */
function anchorOf(term: ClockTerm, anchors: ClockAnchors): Date | undefined {
  if (!term.from.startsWith(CLOCK_REF_PREFIX)) return anchors.triggers.get(term.from)
  const done = anchors.completions.get(term.from.slice(CLOCK_REF_PREFIX.length))
  return done?.status === 'met' ? done.atDate : undefined
}

export type Deadline = { dueAt: Date; startedAt: Date; term: number } | { waiting: string[] }

/**
 * A clock's deadline: the earliest of its terms whose anchor is known (an unknown term can only
 * make it earlier later, never later). Waiting, with the missing anchors, when none is known.
 */
export function deadline(reg: Regulation, clockId: string, anchors: ClockAnchors): Deadline {
  const clock = reg.clocks.find((c) => c.id === clockId)
  if (!clock) return { waiting: [] }
  let best: { dueAt: Date; startedAt: Date; term: number } | undefined
  const waiting: string[] = []
  for (const [i, term] of clock.dueAt.entries()) {
    const from = anchorOf(term, anchors)
    if (!from) {
      waiting.push(term.from)
      continue
    }
    const dueAt = addDuration(from, term, reg.calendar)
    if (!best || dueAt < best.dueAt) best = { dueAt, startedAt: from, term: i }
  }
  return best ?? { waiting }
}

/** Status of a clock at `now` (all floating scenario dates). */
export function clockStatus(
  d: Deadline,
  now: Date,
  completion: (ClockCompletion & { atDate?: Date }) | undefined,
): ClockStatus {
  if (completion?.status === 'waived') return 'waived'
  if (completion?.status === 'missed') return 'missed'
  if (!('dueAt' in d)) return completion?.status === 'met' ? 'met' : 'waiting'
  if (completion?.status === 'met')
    return completion.atDate && completion.atDate > d.dueAt ? 'missed' : 'met'
  if (now > d.dueAt) return 'overdue'
  const span = d.dueAt.getTime() - d.startedAt.getTime()
  const left = d.dueAt.getTime() - now.getTime()
  return span > 0 && left <= span * DUE_SOON_SHARE ? 'due_soon' : 'running'
}

/** The anchors of one regulation from the facilitator session. */
export function anchorsFrom(
  regulationId: string,
  session: ComplianceSession,
  start: Date,
): ClockAnchors {
  const triggers = new Map<string, Date>()
  for (const f of session.fired) {
    if (f.regulationId !== regulationId) continue
    const at = scenarioAt(start, f.exerciseMin)
    const prev = triggers.get(f.triggerId)
    if (!prev || at < prev) triggers.set(f.triggerId, at)
  }
  const completions = new Map<string, ClockCompletion & { atDate?: Date }>()
  const prefix = `${regulationId}:`
  for (const [key, c] of Object.entries(session.clocks)) {
    if (!key.startsWith(prefix)) continue
    const atDate = c.exerciseMin !== undefined ? scenarioAt(start, c.exerciseMin) : undefined
    completions.set(key.slice(prefix.length), { ...c, ...(atDate ? { atDate } : {}) })
  }
  return { triggers, completions }
}

/** One clock as the strip, the room display and the exports show it. */
export interface ClockView {
  key: string
  regulationId: string
  clockId: string
  label: string
  recipient: string
  status: ClockStatus
  dueAt?: Date
  /** Minutes until the deadline (negative once overdue); only while it runs. */
  minutesLeft?: number
  /** Trigger ids or "clock:<id>" refs the clock waits for. */
  waitingFor: string[]
  completion?: ClockCompletion & { atDate?: Date }
}

/** Every clock of a regulation at exercise minute `nowMin`. */
export function clockViews(
  reg: Regulation,
  session: ComplianceSession,
  start: Date,
  nowMin: number,
): ClockView[] {
  const anchors = anchorsFrom(reg.id, session, start)
  const now = scenarioAt(start, nowMin)
  return reg.clocks.map((clock) => {
    const d = deadline(reg, clock.id, anchors)
    const completion = anchors.completions.get(clock.id)
    const status = clockStatus(d, now, completion)
    const running = status === 'running' || status === 'due_soon' || status === 'overdue'
    return {
      key: clockKey(reg.id, clock.id),
      regulationId: reg.id,
      clockId: clock.id,
      label: clock.label,
      recipient: clock.recipient,
      status,
      ...('dueAt' in d ? { dueAt: d.dueAt } : {}),
      ...('dueAt' in d && running
        ? { minutesLeft: Math.floor((d.dueAt.getTime() - now.getTime()) / MIN_MS) }
        : {}),
      waitingFor: 'waiting' in d ? d.waiting : [],
      ...(completion ? { completion } : {}),
    }
  })
}

/** Whether a regulation has any clock that is not waiting (it shows in the strip). */
export const isStarted = (views: readonly ClockView[]): boolean =>
  views.some((v) => v.status !== 'waiting')

export const CLOCK_STATUS_LABEL: Record<ClockStatus, string> = {
  waiting: 'Waiting',
  running: 'Running',
  due_soon: 'Due soon',
  overdue: 'Overdue',
  met: 'Met',
  missed: 'Missed',
  waived: 'Waived',
}
