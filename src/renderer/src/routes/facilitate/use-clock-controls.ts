// Clock controls for Facilitate (spec 0428 FR-1..4): every change is logged, and moving the
// clock back past deliveries asks what to do with them first.
import { useCallback, useMemo, useState } from 'react'
import type { ClockLogEntry, FacilitatorState } from '@shared/ipc'
import {
  changeClock,
  clockMinutes,
  deliveriesAfter,
  isRunning,
  pauseClock,
  resetClock,
  setClock,
  setRate,
  startClock,
} from './clock'
import type { UpdateState } from './use-delivery-actions'

export interface PendingMove {
  kind: ClockLogEntry['kind']
  targetMin: number
  note?: string
  /** Rows delivered after the target time. */
  rows: string[]
}

export interface ClockControls {
  toggle: () => void
  nudge: (deltaMin: number) => void
  set: (minutes: number) => void
  jump: (minutes: number) => void
  setRate: (rate: number) => void
  /** Reset the clock; asks first once something was delivered. */
  reset: () => void
  /** A rewind that passed deliveries, waiting for the facilitator's choice. */
  pendingMove: PendingMove | undefined
  /** Whether a reset is waiting for confirmation. */
  confirmingReset: boolean
  resolveMove: (markNotDelivered: boolean) => void
  cancelMove: () => void
  confirmReset: () => void
  cancelReset: () => void
}

interface Deps {
  state: FacilitatorState
  update: UpdateState
  /** Mark a row not delivered (withdraws it from devices when live play runs). */
  undo: (rowId: string) => void
  onAnnounce: (text: string) => void
}

type Kind = ClockLogEntry['kind']

export function useClockControls({ state, update, undo, onAnnounce }: Deps): ClockControls {
  const [pendingMove, setPendingMove] = useState<PendingMove>()
  const [confirmingReset, setConfirmingReset] = useState(false)

  const commit = useCallback(
    (kind: Kind, targetMin: number, note?: string) => {
      const now = new Date()
      update((s) => changeClock(s, kind, now, (x) => setClock(x, targetMin, now), note))
    },
    [update],
  )

  const move = useCallback(
    (kind: Kind, targetMin: number, note?: string) => {
      const target = Math.max(0, targetMin)
      const rows = target < clockMinutes(state, new Date()) ? deliveriesAfter(state, target) : []
      if (rows.length) setPendingMove({ kind, targetMin: target, rows, ...(note ? { note } : {}) })
      else commit(kind, target, note)
    },
    [state, commit],
  )

  const toggle = useCallback(() => {
    const now = new Date()
    const kind: Kind = isRunning(state) ? 'pause' : 'start'
    update((s) =>
      changeClock(s, kind, now, (x) => (isRunning(x) ? pauseClock(x, now) : startClock(x, now))),
    )
  }, [state, update])

  const nudge = useCallback(
    (delta: number) => {
      const target = clockMinutes(state, new Date()) + delta
      move('nudge', target, `${delta > 0 ? '+' : ''}${delta} min`)
    },
    [state, move],
  )

  const rate = useCallback(
    (r: number) => {
      const now = new Date()
      update((s) => changeClock(s, 'rate', now, (x) => setRate(x, r, now), `${r}×`))
      onAnnounce(`Clock rate ${r}×`)
    },
    [update, onAnnounce],
  )

  const resolveMove = useCallback(
    (markNotDelivered: boolean) => {
      if (!pendingMove) return
      const { kind, targetMin, rows } = pendingMove
      if (markNotDelivered) rows.forEach(undo)
      const note = [pendingMove.note, markNotDelivered ? `not delivered: ${rows.join(', ')}` : '']
        .filter(Boolean)
        .join('; ')
      commit(kind, targetMin, note || undefined)
      setPendingMove(undefined)
      onAnnounce(
        markNotDelivered
          ? `Clock moved back; ${rows.length} row${rows.length === 1 ? '' : 's'} marked not delivered`
          : 'Clock moved back; deliveries kept',
      )
    },
    [pendingMove, undo, commit, onAnnounce],
  )

  const doReset = useCallback(() => {
    const now = new Date()
    update((s) => changeClock(s, 'reset', now, (x) => resetClock(x), undefined))
    setConfirmingReset(false)
  }, [update])

  return useMemo(
    () => ({
      toggle,
      nudge,
      set: (m) => move('set', m),
      jump: (m) => move('jump', m),
      setRate: rate,
      reset: () => (Object.keys(state.delivered).length ? setConfirmingReset(true) : doReset()),
      pendingMove,
      confirmingReset,
      resolveMove,
      cancelMove: () => setPendingMove(undefined),
      confirmReset: doReset,
      cancelReset: () => setConfirmingReset(false),
    }),
    [
      toggle,
      nudge,
      move,
      rate,
      state.delivered,
      doReset,
      pendingMove,
      confirmingReset,
      resolveMove,
    ],
  )
}
