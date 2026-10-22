// One editable MSEL row: a sortable <tr> of grid cells.
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DropdownMenu } from 'radix-ui'
import { clsx } from 'clsx'
import { GripVertical, Lock, LockOpen, MoreHorizontal, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import type { MselRow } from '@shared/schemas/scenario'
import { TagChip } from '../../components/ui'
import { CitationsEditor, ListCellEditor, TextCellEditor, type Move } from './CellEditors'
import { CompactCitations } from './cell-views'
import {
  FORMAT_OPTIONS,
  citationItems,
  formatLabel,
  roleOptions,
  toDisplay,
  toValues,
  validateTime,
} from './cell-format'
import { PURPOSE_TAGS, PURPOSE_TAG_INFO } from '@shared/taxonomy'
import type { ListOption } from './CellEditors'
import { isCell, useGrid, type GridContextValue } from './grid-context'
import type { ColumnId } from './grid-nav'
import { phaseWindowWarning, type DraftRow } from './model'

const CONTROL_TAGS = new Set(['STARTEX', 'ENDEX', 'TIME_JUMP'])

interface CellProps {
  line: string
  col: ColumnId
  className?: string
  /** True when the cell's focus target is an inner control (button, checkbox). */
  inner?: boolean
  children: ReactNode
}

function GridCell({ line, col, className, inner, children }: CellProps) {
  const g = useGrid()
  const active = isCell(g.active, line, col)
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

function editorFor(g: GridContextValue, r: DraftRow, col: ColumnId, anchor: ReactNode) {
  const cell = { line: r.key, col }
  const props = {
    onCommit: (v: unknown, move: Move) => g.commit(cell, v, move),
    onCancel: g.cancelEdit,
  }
  const row = r.row
  const text = (initial: string, label: string, multiline = false) => (
    <TextCellEditor {...props} initial={initial} label={label} multiline={multiline} />
  )
  switch (col) {
    case 'time':
      return (
        <TextCellEditor
          {...props}
          initial={row.time}
          label={`Time for ${row.id}`}
          validate={validateTime}
          hint="H:MM"
        />
      )
    case 'id':
      return (
        <TextCellEditor
          {...props}
          initial={row.id}
          label="Row ID"
          validate={(v) => (v.trim() ? null : 'ID is required')}
        />
      )
    case 'from':
      return text(row.from, `From for ${row.id}`)
    case 'event':
      return text(row.event, `Event for ${row.id}`, true)
    case 'expected':
      return text(row.expectedAction, `Expected action for ${row.id}`, true)
    case 'to':
      return (
        <ListCellEditor
          {...props}
          anchor={anchor}
          label={`To for ${row.id}`}
          initial={toValues(row)}
          options={roleOptions(g.roles)}
          multiple
          exclusive={['__all__']}
        />
      )
    case 'tag':
      return (
        <ListCellEditor
          {...props}
          anchor={anchor}
          label={`Tag for ${row.id}`}
          initial={[row.purposeTag]}
          options={TAG_OPTIONS}
        />
      )
    case 'format':
      return (
        <ListCellEditor
          {...props}
          anchor={anchor}
          label={`Format for ${row.id}`}
          initial={[row.format ?? '']}
          options={FORMAT_OPTIONS}
          filterable
        />
      )
    case 'citations':
      return (
        <CitationsEditor
          {...props}
          anchor={anchor}
          label={`Citations for ${row.id}`}
          items={citationItems(row.citations)}
          initial={row.citations.map((_, i) => i)}
        />
      )
    default:
      return null
  }
}

const TAG_OPTIONS: ListOption[] = PURPOSE_TAGS.map((t) => ({
  value: t,
  label: PURPOSE_TAG_INFO[t].label,
  render: <TagChip tag={t} />,
  hint: PURPOSE_TAG_INFO[t].meaning,
}))

const POPOVER_COLS = new Set<ColumnId>(['to', 'tag', 'format', 'citations'])

function viewFor(row: MselRow, col: ColumnId, g: GridContextValue): ReactNode {
  switch (col) {
    case 'time': {
      const warn = phaseWindowWarning(row, g.phases)
      return (
        <>
          <span className="mono">{row.time}</span>
          {row.wallClock && <span className="msel-editor__wall muted">{row.wallClock}</span>}
          {warn && (
            <span className="msel-editor__time-warn" title={warn}>
              <TriangleAlert size={12} aria-hidden />
              <span className="sr-only">{warn}</span>
            </span>
          )}
        </>
      )
    }
    case 'id':
      return <RowId row={row} warnings={g.warnings.get(row.id)} />
    case 'from':
      return row.from || <span className="muted">—</span>
    case 'to':
      return toDisplay(row, g.roles)
    case 'event':
      return row.event || <span className="muted">Empty: press Enter to write</span>
    case 'expected':
      return row.expectedAction || <span className="muted">—</span>
    case 'tag':
      return <TagChip tag={row.purposeTag} />
    case 'format':
      return formatLabel(row.format)
    case 'citations':
      return <CompactCitations citations={row.citations} />
    default:
      return null
  }
}

function RowId({ row, warnings }: { row: MselRow; warnings: string[] | undefined }) {
  return (
    <>
      <span className="mono msel-editor__id">{row.id}</span>
      {row.injectId && <span className="sr-only"> (has inject)</span>}
      {warnings?.length ? (
        <span className="msel-editor__row-warn" title={warnings.join('\n')}>
          <TriangleAlert size={13} aria-hidden />
          <span className="sr-only">
            {warnings.length} warning{warnings.length > 1 ? 's' : ''}: {warnings.join('; ')}
          </span>
        </span>
      ) : null}
    </>
  )
}

function ContentCell({ r, col }: { r: DraftRow; col: ColumnId }) {
  const g = useGrid()
  const editing = isCell(g.editing, r.key, col)
  const view = <div className="msel-editor__view">{viewFor(r.row, col, g)}</div>
  return (
    <GridCell line={r.key} col={col}>
      {editing && !POPOVER_COLS.has(col) && editorFor(g, r, col, null)}
      {editing && POPOVER_COLS.has(col) && editorFor(g, r, col, view)}
      {!editing && view}
    </GridCell>
  )
}

function focusProps(g: GridContextValue, line: string, col: ColumnId) {
  const active = isCell(g.active, line, col)
  return {
    'data-focus': true,
    tabIndex: active ? 0 : -1,
    onFocus: () => {
      if (!active) g.activate({ line, col })
    },
  }
}

function RowMenu({ r }: { r: DraftRow }) {
  const g = useGrid()
  const item = (action: Parameters<GridContextValue['rowAction']>[1], label: string) => (
    <DropdownMenu.Item className="msel-menu__item" onSelect={() => g.rowAction(r.key, action)}>
      {label}
    </DropdownMenu.Item>
  )
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="btn btn--ghost btn--sm btn--icon"
          aria-label={`Actions for ${r.row.id}`}
          {...focusProps(g, r.key, 'actions')}
        >
          <MoreHorizontal size={14} aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="msel-menu" align="end" sideOffset={4}>
          {item('add-after', 'Add row after')}
          {item('duplicate', 'Duplicate row')}
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="msel-menu__item">
              Move to phase
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className="msel-menu">
                {g.phases.map((p) => (
                  <DropdownMenu.Item
                    key={p.id}
                    className="msel-menu__item"
                    disabled={p.id === r.row.phaseId}
                    onSelect={() => g.rowAction(r.key, `move:${p.id}`)}
                  >
                    Phase {p.index + 1}: {p.title}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Separator className="msel-menu__separator" />
          <DropdownMenu.Item
            className="msel-menu__item msel-menu__item--danger"
            onSelect={() => g.rowAction(r.key, 'delete')}
          >
            Delete row…
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

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

export function MselRowView({ r }: { r: DraftRow }) {
  const g = useGrid()
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: r.key })
  const style = { transform: CSS.Translate.toString(transform), transition }
  const selected = g.selected.has(r.key)
  const warned = !!g.warnings.get(r.row.id)?.length
  return (
    <tr
      ref={setNodeRef}
      style={style}
      aria-selected={selected}
      data-row-key={r.key}
      className={clsx(
        'msel-editor__row',
        CONTROL_TAGS.has(r.row.purposeTag) && 'msel-editor__row--control',
        isDragging && 'is-dragging',
        warned && 'has-warning',
      )}
    >
      <GridCell line={r.key} col="select" inner>
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
          {...focusProps(g, r.key, 'select')}
        />
      </GridCell>
      <GridCell line={r.key} col="drag" inner>
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="btn btn--ghost btn--sm btn--icon msel-editor__handle"
          aria-label={`Move ${r.row.id}`}
          {...attributes}
          {...listeners}
          {...focusProps(g, r.key, 'drag')}
          aria-roledescription="sortable row"
        >
          <GripVertical size={14} aria-hidden />
        </button>
      </GridCell>
      {CONTENT_COLS.map((col) => (
        <ContentCell key={col} r={r} col={col} />
      ))}
      <GridCell line={r.key} col="locked" inner>
        <button
          type="button"
          className={clsx('btn btn--ghost btn--sm btn--icon', r.row.locked && 'is-locked')}
          aria-pressed={r.row.locked}
          aria-label={`Lock ${r.row.id}`}
          title={r.row.locked ? 'Locked: kept when the MSEL is regenerated' : 'Not locked'}
          onClick={() => g.toggleLock(r.key)}
          {...focusProps(g, r.key, 'locked')}
        >
          {r.row.locked ? <Lock size={14} aria-hidden /> : <LockOpen size={14} aria-hidden />}
        </button>
      </GridCell>
      <GridCell line={r.key} col="actions" inner>
        <RowMenu r={r} />
      </GridCell>
    </tr>
  )
}
