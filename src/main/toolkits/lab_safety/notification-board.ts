// The notification matrix and clock board (spec 0466 FR-5): from the regulations a lab incident
// triggers, the triggers fired so far and the filings recorded, build the rows of the
// lab_notification_clock_board figure. The clock arithmetic is the shared regulatory clock
// framework (spec 0426), so a deadline here is the one the Facilitate clocks strip shows, on
// exercise time (a time jump moves the board with it).
//
// "Immediately" has no number in the regulations. The clocks mark it as one minute; the board
// widens it to the window the designer sets (default 60 minutes) so a call made a few minutes
// after discovery is not scored late, and says so in the rule column.
import { anchorsFrom, clockStatus, deadline, type Deadline } from '@shared/compliance/clock'
import { formatScenarioDate, formatSpan, scenarioAt } from '@shared/compliance/scenario-time'
import type { ClockTerm, ComplianceSession, Regulation } from '@shared/schemas/compliance'
import type { LabClockBoardData, NotificationState } from '../../render/figures/lab/clock-board'

export const DEFAULT_IMMEDIATE_MINUTES = 60

export interface NotificationBoardOptions {
  title?: string
  /** Minutes that count as "immediately" for the exercise. */
  immediateMinutes?: number
}

/** A clock with one term of at most one minute is the regulation's "immediately". */
export const isImmediate = (terms: readonly ClockTerm[]): boolean =>
  terms.length === 1 && terms[0]!.unit === 'minutes' && terms[0]!.amount <= 1

const UNIT_WORDS: Record<ClockTerm['unit'], string> = {
  minutes: 'minutes',
  hours: 'hours',
  calendar_days: 'calendar days',
  business_days: 'business days',
  months: 'months',
}

/** "Immediately (within 60 minutes for this exercise)" or "Within 7 calendar days". */
export function ruleWords(terms: readonly ClockTerm[], immediateMinutes: number): string {
  if (isImmediate(terms)) return `Immediately (exercise window ${immediateMinutes} minutes)`
  return terms.map((t) => `Within ${t.amount} ${UNIT_WORDS[t.unit]}`).join(' or ')
}

const MIN_MS = 60_000

/** The deadline with an immediate clock widened to the exercise window. */
function widened(d: Deadline, immediate: boolean, immediateMinutes: number): Deadline {
  if (!immediate || !('dueAt' in d)) return d
  return { ...d, dueAt: new Date(d.startedAt.getTime() + immediateMinutes * MIN_MS) }
}

/** The rows of the clock board at exercise minute `nowMin`, one per clock of each regulation. */
export function notificationBoardData(
  regulations: readonly Regulation[],
  session: ComplianceSession,
  start: Date,
  nowMin: number,
  options: NotificationBoardOptions = {},
): LabClockBoardData {
  const immediateMinutes = options.immediateMinutes ?? DEFAULT_IMMEDIATE_MINUTES
  const now = scenarioAt(start, nowMin)
  const rows: LabClockBoardData['rows'] = []
  for (const reg of regulations) {
    const anchors = anchorsFrom(reg.id, session, start)
    for (const clock of reg.clocks) {
      const immediate = isImmediate(clock.dueAt)
      const d = widened(deadline(reg, clock.id, anchors), immediate, immediateMinutes)
      const done = anchors.completions.get(clock.id)
      const raw = clockStatus(d, now, done)
      const status = boardState(raw, done?.atDate !== undefined)
      const proposed = reg.status === 'proposed' ? ' (proposed rule)' : ''
      rows.push({
        notification: `${clock.label}${proposed}`,
        recipient: clock.recipient,
        rule: ruleWords(clock.dueAt, immediateMinutes),
        due: 'dueAt' in d ? formatScenarioDate(d.dueAt, { year: true }) : '',
        status,
        made: madeText(d, done?.atDate),
        note: status === 'not_started' ? 'Waiting for the trigger' : '',
      })
    }
  }
  return { ...(options.title ? { title: options.title } : {}), asOf: asOf(now), rows }
}

const asOf = (now: Date): string => formatScenarioDate(now, { year: true })

function boardState(raw: ReturnType<typeof clockStatus>, hasFiling: boolean): NotificationState {
  switch (raw) {
    case 'waiting':
      return 'not_started'
    case 'running':
      return 'open'
    case 'due_soon':
      return 'due_soon'
    case 'overdue':
      return 'late'
    case 'met':
      return 'made'
    case 'missed':
      return hasFiling ? 'made_late' : 'late'
    case 'waived':
      return 'waived'
  }
}

/** "Wed 21 Oct 2026 09:40, 20 m early" for a filing; empty without one. */
function madeText(d: Deadline, at: Date | undefined): string {
  if (!at) return ''
  const when = formatScenarioDate(at, { year: true })
  if (!('dueAt' in d)) return when
  const diff = Math.round((at.getTime() - d.dueAt.getTime()) / MIN_MS)
  return `${when}, ${formatSpan(Math.abs(diff))} ${diff > 0 ? 'late' : 'early'}`
}
