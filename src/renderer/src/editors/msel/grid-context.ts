// What MSEL rows read from the grid. Split so rows can be memoized (#201): the actions object
// never changes identity (it calls the latest handlers), the shared data changes only when the
// roles or phases do, and everything per-row (active / editing column, selection, warnings)
// is passed to each row as props.
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef } from 'react'
import type { Role } from '@shared/schemas/project'
import type { Phase, ScenarioSeam } from '@shared/schemas/scenario'
import type { GroundingResult } from '@shared/schemas/grounding'
import type { Move } from './CellEditors'
import type { Cell, ColumnId } from './grid-nav'

export type RowAction = 'add-after' | 'duplicate' | 'delete' | 'sources' | `move:${string}`

export interface GridActions {
  activate: (cell: Cell) => void
  startEdit: (cell: Cell) => void
  commit: (cell: Cell, value: unknown, move: Move) => void
  cancelEdit: () => void
  toggleSelect: (key: string, range: boolean) => void
  togglePhaseSelect: (phaseId: string) => void
  toggleLock: (key: string) => void
  rowAction: (key: string, action: RowAction) => void
}

export interface GridShared {
  roles: Role[]
  phases: Phase[]
  /** Source-check results by item key ("row:I-07"), when loaded (#423). */
  grounding?: Record<string, GroundingResult> | undefined
  /** The plan seams the scenario tests (#427), for the Seam tag on seam rows. */
  seams?: ScenarioSeam[] | undefined
}

/** Everything the grid needs from the editor (`actions` must keep its identity). */
export interface GridContextValue extends GridShared {
  actions: GridActions
  active: Cell | null
  editing: Cell | null
  dragging: boolean
  selected: ReadonlySet<string>
  /** Row id → warning messages (lint after save + local checks). */
  warnings: ReadonlyMap<string, string[]>
}

export const GridActionsContext = createContext<GridActions | null>(null)
export const GridSharedContext = createContext<GridShared | null>(null)

export function useGridActions(): GridActions {
  const ctx = useContext(GridActionsContext)
  if (!ctx) throw new Error('useGridActions outside MselGrid')
  return ctx
}

export function useGridShared(): GridShared {
  const ctx = useContext(GridSharedContext)
  if (!ctx) throw new Error('useGridShared outside MselGrid')
  return ctx
}

/** A GridActions object with a stable identity that always calls the latest handlers. */
export function useStableActions(latest: GridActions): GridActions {
  const ref = useRef(latest)
  useLayoutEffect(() => {
    ref.current = latest
  })
  return useMemo(
    () => ({
      activate: (cell) => ref.current.activate(cell),
      startEdit: (cell) => ref.current.startEdit(cell),
      commit: (cell, value, move) => ref.current.commit(cell, value, move),
      cancelEdit: () => ref.current.cancelEdit(),
      toggleSelect: (key, range) => ref.current.toggleSelect(key, range),
      togglePhaseSelect: (phaseId) => ref.current.togglePhaseSelect(phaseId),
      toggleLock: (key) => ref.current.toggleLock(key),
      rowAction: (key, action) => ref.current.rowAction(key, action),
    }),
    [],
  )
}

/** The column of `c` when it is on `line`, else null (a row's own slice of the grid state). */
export const colOn = (c: Cell | null, line: string): ColumnId | null =>
  c && c.line === line ? c.col : null

export const isCell = (c: Cell | null, line: string, col: ColumnId): boolean =>
  !!c && c.line === line && c.col === col

/** Props for the control a cell focuses (checkbox, handle, buttons): roving tab stop. */
export function focusProps(g: GridActions, line: string, col: ColumnId, active: boolean) {
  return {
    'data-focus': true,
    tabIndex: active ? 0 : -1,
    onFocus: () => {
      if (!active) g.activate({ line, col })
    },
  }
}

/** One ref callback for a row: dnd-kit's node ref plus the list window's measurement. */
export function useRowRef(
  setNodeRef: (el: HTMLElement | null) => void,
  measure: ((el: HTMLElement | null) => void) | undefined,
) {
  return useCallback(
    (el: HTMLTableRowElement | null) => {
      setNodeRef(el)
      measure?.(el)
    },
    [setNodeRef, measure],
  )
}
