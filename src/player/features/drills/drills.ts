/**
 * What a device knows about a micro-drill sent to it (spec 0437 FR-17): the situation and the
 * questions from `drill.open`, and per question what the facilitator's app sent back (which
 * points the answer covered, hints, the checklist). Pure helpers, so the rules are tested
 * without a browser. Expected points, hints and model answers are never on the device until the
 * controller sends them in a `drill.feedback`.
 */
import type { Opened } from '../../../shared/live/codec'
import type { DrillFeedbackPayload, DrillOpenPayload } from '../../../shared/live/schemas'
import { seatDestinations, type SeatView } from '../../app/items'

export type DrillStep = DrillOpenPayload['steps'][number]
export type DrillHint = NonNullable<DrillFeedbackPayload['hint']>

/** What came back for one question. */
export interface StepState {
  /** An answer or hint request is on its way and no reply has arrived. */
  pending: boolean
  /** The latest reply to an answer (`result` or `checklist`), or an error. */
  reply?: DrillFeedbackPayload
  /** Hints received, in order. */
  hints: DrillHint[]
  /** True once an answer to this question was checked. */
  checked: boolean
}

export interface PlayerDrill {
  drillId: string
  title: string
  situation: string
  durationMin: number
  assessment: 'model' | 'checklist'
  steps: DrillStep[]
  targets: string[]
  status: 'open' | 'closed'
  progress: Readonly<Record<string, StepState>>
  openedAt: number
}

export type DrillMap = Readonly<Record<string, PlayerDrill>>

const EMPTY_STEP: StepState = { pending: false, hints: [], checked: false }

export const stepState = (drill: PlayerDrill, stepId: string): StepState =>
  drill.progress[stepId] ?? EMPTY_STEP

/** A seat in the drill's scope: players only, as the controller's app also checks. */
export function mayJoin(drill: Pick<PlayerDrill, 'targets'>, seat: SeatView | undefined) {
  if (!seat || seat.kind !== 'player') return false
  if (drill.targets.includes('all')) return true
  const mine = seatDestinations(seat)
  return drill.targets.some((t) => mine.has(t))
}

/** Apply a `drill.open`. A repeated id keeps this device's progress. */
export function applyOpen(
  drills: DrillMap,
  msg: Opened<'drill.open'>,
  at: number,
): { drills: DrillMap; isNew: boolean } {
  const p = msg.payload
  const before = drills[p.drillId]
  const next: PlayerDrill = {
    drillId: p.drillId,
    title: p.title,
    situation: p.situation,
    durationMin: p.durationMin,
    assessment: p.assessment,
    steps: p.steps,
    targets: p.targets,
    status: before?.status ?? 'open',
    progress: before?.progress ?? {},
    openedAt: before?.openedAt ?? at,
  }
  return { drills: { ...drills, [p.drillId]: next }, isNew: !before }
}

/** Apply a `drill.close`. A drill this device never heard of is ignored. */
export function applyClose(drills: DrillMap, msg: Opened<'drill.close'>): DrillMap {
  const before = drills[msg.payload.drillId]
  if (!before) return drills
  return { ...drills, [before.drillId]: { ...before, status: 'closed' } }
}

function update(drill: PlayerDrill, stepId: string, change: Partial<StepState>): PlayerDrill {
  if (!drill.steps.some((s) => s.id === stepId)) return drill
  return {
    ...drill,
    progress: { ...drill.progress, [stepId]: { ...stepState(drill, stepId), ...change } },
  }
}

/** Mark a question as waiting for the controller's reply. */
export function markPending(drills: DrillMap, drillId: string, stepId: string): DrillMap {
  const drill = drills[drillId]
  return drill ? { ...drills, [drillId]: update(drill, stepId, { pending: true }) } : drills
}

/** Apply a `drill.feedback`: a result or checklist replaces the reply, a hint is added. */
export function applyFeedback(drills: DrillMap, msg: Opened<'drill.feedback'>): DrillMap {
  const p = msg.payload
  const drill = drills[p.drillId]
  if (!drill) return drills
  const now = stepState(drill, p.stepId)
  const next =
    p.kind === 'hint' && p.hint
      ? update(drill, p.stepId, {
          pending: false,
          hints: now.hints.some((h) => h.level === p.hint!.level)
            ? now.hints
            : [...now.hints, p.hint],
        })
      : update(drill, p.stepId, {
          pending: false,
          reply: p,
          checked: now.checked || p.kind === 'result',
        })
  return { ...drills, [p.drillId]: next }
}

/** The open drill waiting longest for this seat, for the banner. */
export function currentDrill(
  drills: DrillMap,
  seat: SeatView | undefined,
): PlayerDrill | undefined {
  return Object.values(drills)
    .filter((d) => d.status === 'open' && mayJoin(d, seat))
    .sort((a, b) => b.openedAt - a.openedAt)[0]
}

/** Index of the first question with no checked answer, or the last one when all are done. */
export function firstOpenStep(drill: PlayerDrill): number {
  const i = drill.steps.findIndex((s) => !stepState(drill, s.id).checked)
  return i === -1 ? drill.steps.length - 1 : i
}

export const allChecked = (drill: PlayerDrill): boolean =>
  drill.steps.every((s) => stepState(drill, s.id).checked)
