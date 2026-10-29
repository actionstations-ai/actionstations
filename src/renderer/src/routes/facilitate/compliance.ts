// Regulatory clocks in Facilitate (#426): pure reducers over FacilitatorState.compliance. Firing a
// trigger records the exercise minute (the clocks count from it, so time jumps move them); filing,
// missing or waiving a clock records a completion. Everything else (deadlines, status) is derived
// by src/shared/compliance/clock.ts, so the strip, the room display and the exports agree.
import type { FacilitatorState } from '@shared/ipc'
import { clockViews, type ClockView } from '@shared/compliance/clock'
import { formatLocal, parseLocal, scenarioAt } from '@shared/compliance/scenario-time'
import {
  sessionOf,
  type ClockCompletion,
  type ComplianceSession,
  type FiredTrigger,
  type Regulation,
} from '@shared/schemas/compliance'
import type { MselRow } from '@shared/schemas/scenario'

let seq = 0
/** A SafeId for a fired trigger. */
export const newFiredId = (now = Date.now()): string =>
  `f-${now.toString(36)}-${(seq++).toString(36)}`

const withSession = (s: FacilitatorState, session: ComplianceSession): FacilitatorState => ({
  ...s,
  compliance: session,
})

export interface FireInput {
  regulationId: string
  triggerId: string
  exerciseMin: number
  by: FiredTrigger['by']
  rowId?: string
  note?: string
}

/** Record a trigger at an exercise minute (stored with the scenario date-time it stands for). */
export function fireTrigger(s: FacilitatorState, f: FireInput, start: Date): FacilitatorState {
  const session = sessionOf(s)
  const exerciseMin = Math.floor(f.exerciseMin)
  const fired: FiredTrigger = {
    id: newFiredId(),
    regulationId: f.regulationId,
    triggerId: f.triggerId,
    exerciseMin,
    scenarioAt: formatLocal(scenarioAt(start, exerciseMin)),
    by: f.by,
    ...(f.rowId ? { rowId: f.rowId } : {}),
    note: f.note ?? '',
  }
  return withSession(s, { ...session, fired: [...session.fired, fired] })
}

/**
 * Fire the triggers a delivered row carries, for the regulations the project has on. A row
 * delivered again (after an undo) fires them again; one already fired by this row is skipped.
 */
export function fireRowTriggers(
  s: FacilitatorState,
  row: MselRow,
  enabled: ReadonlySet<string>,
  exerciseMin: number,
  start: Date,
): { state: FacilitatorState; fired: { regulationId: string; triggerId: string }[] } {
  let next = s
  const fired: { regulationId: string; triggerId: string }[] = []
  for (const t of row.triggers ?? []) {
    if (!enabled.has(t.regulationId)) continue
    const already = sessionOf(next).fired.some(
      (f) => f.rowId === row.id && f.regulationId === t.regulationId && f.triggerId === t.triggerId,
    )
    if (already) continue
    next = fireTrigger(next, { ...t, exerciseMin, by: 'row', rowId: row.id }, start)
    fired.push(t)
  }
  return { state: next, fired }
}

/** Undoing a delivery takes back the triggers that row fired. */
export function unfireRow(s: FacilitatorState, rowId: string): FacilitatorState {
  const session = sessionOf(s)
  if (!session.fired.some((f) => f.rowId === rowId && f.by === 'row')) return s
  return withSession(s, {
    ...session,
    fired: session.fired.filter((f) => !(f.rowId === rowId && f.by === 'row')),
  })
}

export function removeFired(s: FacilitatorState, firedId: string): FacilitatorState {
  const session = sessionOf(s)
  return withSession(s, { ...session, fired: session.fired.filter((f) => f.id !== firedId) })
}

/** Record that a clock was filed (met), missed or waived. */
export function completeClock(
  s: FacilitatorState,
  key: string,
  c: { status: ClockCompletion['status']; exerciseMin?: number; note?: string },
  start: Date,
): FacilitatorState {
  const session = sessionOf(s)
  const at =
    c.exerciseMin === undefined
      ? {}
      : {
          exerciseMin: Math.floor(c.exerciseMin),
          scenarioAt: formatLocal(scenarioAt(start, Math.floor(c.exerciseMin))),
        }
  const completion: ClockCompletion = { status: c.status, ...at, note: c.note ?? '' }
  return withSession(s, { ...session, clocks: { ...session.clocks, [key]: completion } })
}

export function clearCompletion(s: FacilitatorState, key: string): FacilitatorState {
  const session = sessionOf(s)
  const { [key]: _drop, ...clocks } = session.clocks
  return withSession(s, { ...session, clocks })
}

export function toggleOnScreen(s: FacilitatorState, key: string): FacilitatorState {
  const session = sessionOf(s)
  const onScreen = session.onScreen.includes(key)
    ? session.onScreen.filter((k) => k !== key)
    : [...session.onScreen, key]
  return withSession(s, { ...session, onScreen })
}

export interface RegulationClocks {
  regulation: Regulation
  views: ClockView[]
  /** Any trigger of this regulation has fired. */
  started: boolean
}

/** Clock views per regulation, in the order given. */
export function regulationClocks(
  regulations: readonly Regulation[],
  s: FacilitatorState,
  start: Date,
  minutes: number,
): RegulationClocks[] {
  const session = sessionOf(s)
  return regulations.map((regulation) => ({
    regulation,
    views: clockViews(regulation, session, start, minutes),
    started: session.fired.some((f) => f.regulationId === regulation.id),
  }))
}

const ANNOUNCED = new Set(['due_soon', 'overdue', 'met', 'missed', 'waived', 'running'])

/**
 * Screen-reader text for status changes between two renders (never the countdown itself): one
 * sentence per clock whose status changed to one worth announcing.
 */
export function statusChanges(
  before: ReadonlyMap<string, string>,
  groups: readonly RegulationClocks[],
  label: (g: RegulationClocks, v: ClockView) => string,
): string[] {
  const out: string[] = []
  for (const g of groups)
    for (const v of g.views) {
      const prev = before.get(v.key)
      if (prev === undefined || prev === v.status || !ANNOUNCED.has(v.status)) continue
      out.push(label(g, v))
    }
  return out
}

/** "10:40" or "2026-03-12 10:40" typed by the facilitator → a scenario date-time, or undefined. */
export function parseScenarioInput(text: string, now: Date): Date | undefined {
  const t = text.trim()
  const full = /^(\d{4}-\d{2}-\d{2})[ T]([01]?\d|2[0-3]):([0-5]\d)$/.exec(t)
  if (full) return parseLocal(`${full[1]}T${full[2]!.padStart(2, '0')}:${full[3]}`)
  const time = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t)
  if (!time) return undefined
  const day = now.toISOString().slice(0, 10)
  return parseLocal(`${day}T${time[1]!.padStart(2, '0')}:${time[2]}`)
}
