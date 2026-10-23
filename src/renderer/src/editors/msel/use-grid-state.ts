// The grid's UI state: active cell (roving tab stop), the cell being edited, focus requests,
// drag state, the per-row warnings and the snap step for drag retiming.
import { useCallback, useMemo, useState } from 'react'
import type { LintWarning } from '@shared/schemas/scenario'
import { warningsByRow } from './cell-format'
import type { Cell } from './grid-nav'
import { useLines } from './grid-lines'
import type { Draft } from './model'

const SNAP_KEY = 'ttx.msel.snap'

function readSnap(): number {
  try {
    const v = Number(localStorage.getItem(SNAP_KEY))
    return v > 0 ? v : 5
  } catch {
    return 5
  }
}

function saveSnap(step: number): void {
  try {
    localStorage.setItem(SNAP_KEY, String(step))
  } catch {
    // Storage may be unavailable; the default step still works.
  }
}

/** Snap step (minutes) for drag retiming, remembered across sessions. */
export function useSnap(): [number, (step: number) => void] {
  const [snap, setSnap] = useState(readSnap)
  const set = useCallback((step: number) => {
    setSnap(step)
    saveSnap(step)
  }, [])
  return [snap, set]
}

export function useGridState(draft: Draft) {
  const [activeRaw, setActive] = useState<Cell | null>(null)
  const [editing, setEditing] = useState<Cell | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  const [dragging, setDragging] = useState(false)
  const lines = useLines(draft)
  // Fall back to the first cell so the grid always has one tab stop.
  const active = useMemo<Cell | null>(() => {
    if (activeRaw && lines.some((l) => l.key === activeRaw.line)) return activeRaw
    const first = lines.find((l) => l.kind === 'row') ?? lines[0]
    return first ? { line: first.key, col: first.kind === 'row' ? 'time' : 'event' } : null
  }, [activeRaw, lines])
  const requestFocus = useCallback(() => setFocusTick((t) => t + 1), [])
  const focus = useCallback(
    (cell: Cell) => {
      setActive(cell)
      requestFocus()
    },
    [requestFocus],
  )
  return {
    lines,
    active,
    setActive,
    editing,
    setEditing,
    focusTick,
    requestFocus,
    focus,
    dragging,
    setDragging,
  }
}

export type GridState = ReturnType<typeof useGridState>

const sameList = (a: string[] | undefined, b: string[]) =>
  !!a && a.length === b.length && a.every((x, i) => x === b[i])

/** Row id → warnings, reusing the previous arrays when unchanged (memoized rows stay put). */
export function useRowWarnings(lint: LintWarning[] | undefined): Map<string, string[]> {
  const [cache, setCache] = useState(() => ({ lint, map: warningsByRow(lint) }))
  if (cache.lint === lint) return cache.map
  const map = warningsByRow(lint)
  for (const [id, list] of map) {
    const old = cache.map.get(id)
    if (sameList(old, list)) map.set(id, old!)
  }
  setCache({ lint, map })
  return map
}
