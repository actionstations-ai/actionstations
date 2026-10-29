// One editable MSEL row: a sortable <tr> of grid cells. Memoized (#201): it re-renders only
// when its draft row, its slice of the grid state (active / editing column, selection,
// warnings) or its position changes, so committing one edit re-renders one row.
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { clsx } from 'clsx'
import { GripVertical, Lock, LockOpen } from 'lucide-react'
import { memo } from 'react'
import { editorFor, POPOVER_COLS, viewFor } from './cell-content'
import { GridCell } from './grid-cell'
import { focusProps, useGridActions, useGridShared, useRowRef } from './grid-context'
import type { ColumnId } from './grid-nav'
import type { DraftRow } from './model'
import { RowMenu } from './RowMenu'

const CONTROL_TAGS = new Set(['STARTEX', 'ENDEX', 'TIME_JUMP'])

const CONTENT_COLS: ColumnId[] = [
  'time',
  'id',
  'from',
  'to',
  'event',
  'expected',
  'tag',
  'format',
  'citations',
]

export interface RowViewProps {
  r: DraftRow
  /** 1-based position among the grid's rows (header = 1), for aria-rowindex. */
  rowIndex: number
  /** The grid's active column when the active cell is on this row. */
  activeCol: ColumnId | null
  editingCol: ColumnId | null
  selected: boolean
  warnings: string[] | undefined
  /** Ref callback for the virtualizer's row measurement (undefined when not virtualized). */
  measure?: ((el: HTMLElement | null) => void) | undefined
}

function ContentCell(props: {
  r: DraftRow
  col: ColumnId
  active: boolean
  editing: boolean
  warnings: string[] | undefined
}) {
  const { r, col, editing } = props
  const g = useGridActions()
  const { roles, phases, grounding, seams } = useGridShared()
  const result = col === 'citations' ? grounding?.[`row:${r.row.id}`] : undefined
  const seam = col === 'tag' && r.row.seamId ? seams?.find((x) => x.id === r.row.seamId) : undefined
  const view = (
    <div className="msel-editor__view">
      {viewFor(r.row, col, {
        roles,
        phases,
        warnings: props.warnings,
        grounding: result,
        ...(seam ? { seam } : {}),
      })}
    </div>
  )
  return (
    <GridCell line={r.key} col={col} active={props.active}>
      {editing && editorFor(g, roles, r, col, POPOVER_COLS.has(col) ? view : null)}
      {!editing && view}
    </GridCell>
  )
}

function SelectCell({ r, active, selected }: { r: DraftRow; active: boolean; selected: boolean }) {
  const g = useGridActions()
  return (
    <GridCell line={r.key} col="select" active={active} inner>
      <input
        type="checkbox"
        aria-label={`Select ${r.row.id}`}
        checked={selected}
        onChange={() => undefined}
        onClick={(e) => g.toggleSelect(r.key, e.shiftKey)}
        onKeyDown={(e) => {
          if (e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            g.toggleSelect(r.key, e.shiftKey)
          }
        }}
        {...focusProps(g, r.key, 'select', active)}
      />
    </GridCell>
  )
}

function LockCell({ r, active }: { r: DraftRow; active: boolean }) {
  const g = useGridActions()
  return (
    <GridCell line={r.key} col="locked" active={active} inner>
      <button
        type="button"
        className={clsx('btn btn--ghost btn--sm btn--icon', r.row.locked && 'is-locked')}
        aria-pressed={r.row.locked}
        aria-label={`Lock ${r.row.id}`}
        title={r.row.locked ? 'Locked: kept when the MSEL is regenerated' : 'Not locked'}
        onClick={() => g.toggleLock(r.key)}
        {...focusProps(g, r.key, 'locked', active)}
      >
        {r.row.locked ? <Lock size={14} aria-hidden /> : <LockOpen size={14} aria-hidden />}
      </button>
    </GridCell>
  )
}

/** The drag handle; `handle` carries dnd-kit's activator ref, attributes and listeners. */
function DragCell(props: { r: DraftRow; active: boolean; handle: Record<string, unknown> }) {
  const { r, active } = props
  const g = useGridActions()
  return (
    <GridCell line={r.key} col="drag" active={active} inner>
      <button
        type="button"
        className="btn btn--ghost btn--sm btn--icon msel-editor__handle"
        aria-label={`Move ${r.row.id}`}
        {...props.handle}
        {...focusProps(g, r.key, 'drag', active)}
        aria-roledescription="sortable row"
      >
        <GripVertical size={14} aria-hidden />
      </button>
    </GridCell>
  )
}

function MselRowViewImpl(p: RowViewProps) {
  const { r, activeCol } = p
  const sortable = useSortable({ id: r.key })
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = sortable
  const style = {
    transform: CSS.Translate.toString(sortable.transform),
    transition: sortable.transition,
  }
  const ref = useRowRef(setNodeRef, p.measure)
  return (
    <tr
      ref={ref}
      style={style}
      aria-selected={p.selected}
      aria-rowindex={p.rowIndex}
      data-row-key={r.key}
      data-index={p.rowIndex - 2}
      className={clsx(
        'msel-editor__row',
        CONTROL_TAGS.has(r.row.purposeTag) && 'msel-editor__row--control',
        isDragging && 'is-dragging',
        !!p.warnings?.length && 'has-warning',
      )}
    >
      <SelectCell r={r} active={activeCol === 'select'} selected={p.selected} />
      <DragCell
        r={r}
        active={activeCol === 'drag'}
        handle={{ ref: setActivatorNodeRef, ...attributes, ...listeners }}
      />
      {CONTENT_COLS.map((col) => (
        <ContentCell
          key={col}
          r={r}
          col={col}
          active={activeCol === col}
          editing={p.editingCol === col}
          warnings={p.warnings}
        />
      ))}
      <LockCell r={r} active={activeCol === 'locked'} />
      <GridCell line={r.key} col="actions" active={activeCol === 'actions'} inner>
        <RowMenu r={r} active={activeCol === 'actions'} />
      </GridCell>
    </tr>
  )
}

export const MselRowView = memo(MselRowViewImpl)
