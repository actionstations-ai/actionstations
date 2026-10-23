// A grid cell of an MSEL row (the active one is the grid's single tab stop).
import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { useGridActions } from './grid-context'
import type { ColumnId } from './grid-nav'

interface CellProps {
  line: string
  col: ColumnId
  /** This cell is the grid's active cell (the single tab stop). */
  active: boolean
  className?: string
  /** True when the cell's focus target is an inner control (button, checkbox). */
  inner?: boolean
  children: ReactNode
}

export function GridCell({ line, col, active, className, inner, children }: CellProps) {
  const g = useGridActions()
  return (
    <td
      role="gridcell"
      data-cell={`${line}|${col}`}
      data-col={col}
      className={clsx(`msel-editor__c-${col}`, active && 'is-active', className)}
      tabIndex={inner ? undefined : active ? 0 : -1}
      onFocus={() => {
        if (!active) g.activate({ line, col })
      }}
      onDoubleClick={() => g.startEdit({ line, col })}
    >
      {children}
    </td>
  )
}
