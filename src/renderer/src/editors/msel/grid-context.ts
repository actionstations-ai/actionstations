import { createContext, useContext } from 'react'
import type { Role } from '@shared/schemas/project'
import type { Phase } from '@shared/schemas/scenario'
import type { Move } from './CellEditors'
import type { Cell, ColumnId } from './grid-nav'

export type RowAction = 'add-after' | 'duplicate' | 'delete' | `move:${string}`

export interface GridContextValue {
  active: Cell | null
  editing: Cell | null
  dragging: boolean
  roles: Role[]
  phases: Phase[]
  selected: ReadonlySet<string>
  /** Row id → warning messages (lint after save + local checks). */
  warnings: ReadonlyMap<string, string[]>
  activate: (cell: Cell) => void
  startEdit: (cell: Cell) => void
  commit: (cell: Cell, value: unknown, move: Move) => void
  cancelEdit: () => void
  toggleSelect: (key: string, range: boolean) => void
  togglePhaseSelect: (phaseId: string) => void
  toggleLock: (key: string) => void
  rowAction: (key: string, action: RowAction) => void
}

export const GridContext = createContext<GridContextValue | null>(null)

export function useGrid(): GridContextValue {
  const ctx = useContext(GridContext)
  if (!ctx) throw new Error('useGrid outside MselGrid')
  return ctx
}

export const isCell = (c: Cell | null, line: string, col: ColumnId): boolean =>
  !!c && c.line === line && c.col === col
