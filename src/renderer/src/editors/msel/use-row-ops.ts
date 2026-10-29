// Row operations of the MSEL editor wired to the draft and the grid's focus: insert, delete,
// duplicate, move, lock, cell commits and the stable action object the rows call.
import { useCallback } from 'react'
import type { Move } from './CellEditors'
import { toast } from '../../components/toast-store'
import { commitCell, tabTarget } from './cell-commit'
import { useStableActions, type GridActions, type RowAction } from './grid-context'
import type { Cell } from './grid-nav'
import {
  addRowAfter,
  deleteRows,
  duplicateRow,
  moveToPhase,
  type Draft,
  type Inserted,
} from './model'
import type { GridState } from './use-grid-state'

interface RowOpsDeps {
  draft: Draft
  edit: (next: Draft) => void
  grid: GridState
  /** Rows with an inject ask before they are deleted. */
  confirmDelete: (key: string) => void
  /** Open the "Starts reporting clocks" dialog for a row (#426). */
  editTriggers: (key: string) => void
  editControls: (key: string) => void
  toggleSelect: (key: string, range: boolean) => void
  togglePhaseSelect: (phaseId: string) => void
  /** Open the source-check details of a row (#423). */
  openSources: (key: string) => void
  /** Partner-owned rows (regional exercises) cannot be changed here (#497). */
  isReadOnly: (key: string) => boolean
}

function useInsertRemove(draft: Draft, edit: RowOpsDeps['edit'], grid: GridState) {
  const { focus, lines } = grid
  const applyInsert = useCallback(
    (ins: Inserted | null) => {
      if (!ins) return
      edit(ins.draft)
      focus({ line: ins.key, col: 'event' })
    },
    [edit, focus],
  )
  const removeRow = useCallback(
    (key: string) => {
      const row = draft.rows.find((r) => r.key === key)?.row
      const idx = lines.findIndex((l) => l.key === key)
      edit(deleteRows(draft, new Set([key])))
      const neighbour = lines[idx + 1]?.key ?? lines[idx - 1]?.key
      if (neighbour) focus({ line: neighbour, col: 'id' })
      if (row) toast.info(`Deleted ${row.id}`, 'Undo with Cmd/Ctrl+Z.')
    },
    [draft, lines, edit, focus],
  )
  return { applyInsert, removeRow }
}

export function useRowOps(d: RowOpsDeps) {
  const { draft, edit, grid } = d
  const { applyInsert, removeRow } = useInsertRemove(draft, edit, grid)

  const rowAction = (key: string, action: RowAction) => {
    if (action === 'sources') return d.openSources(key)
    if (action === 'add-after') return applyInsert(addRowAfter(draft, key))
    if (d.isReadOnly(key)) return
    if (action === 'duplicate') return applyInsert(duplicateRow(draft, key))
    if (action === 'clocks') return d.editTriggers(key)
    if (action === 'controls') return d.editControls(key)
    if (action.startsWith('move:')) {
      edit(moveToPhase(draft, new Set([key]), action.slice(5)))
      return grid.focus({ line: key, col: 'time' })
    }
    const row = draft.rows.find((r) => r.key === key)?.row
    if (row?.injectId) d.confirmDelete(key)
    else removeRow(key)
  }

  const commit = (cell: Cell, value: unknown, move: Move) => {
    if (d.isReadOnly(cell.line)) return grid.setEditing(null)
    edit(commitCell(draft, cell, value))
    if (move === 'blur') return grid.setEditing(null)
    const tab = move && !cell.line.startsWith('phase:') ? tabTarget(grid.lines, cell, move) : null
    grid.setEditing(tab)
    if (tab) grid.setActive(tab)
    else grid.focus(cell)
  }

  const toggleLock = (key: string) => {
    const row = draft.rows.find((r) => r.key === key)?.row
    if (!row || d.isReadOnly(key)) return
    edit({
      ...draft,
      rows: draft.rows.map((r) =>
        r.key === key ? { ...r, row: { ...row, locked: !row.locked } } : r,
      ),
    })
  }

  const actions: GridActions = useStableActions({
    activate: grid.setActive,
    startEdit: (cell) => {
      grid.setActive(cell)
      if (!d.isReadOnly(cell.line)) grid.setEditing(cell)
    },
    commit,
    cancelEdit: () => {
      grid.setEditing(null)
      grid.requestFocus()
    },
    toggleSelect: d.toggleSelect,
    togglePhaseSelect: d.togglePhaseSelect,
    toggleLock,
    rowAction,
  })
  return { actions, applyInsert, removeRow }
}
