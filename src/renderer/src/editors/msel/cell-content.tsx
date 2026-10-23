// What each MSEL column shows: its read-mode view, and its in-cell editor (text inputs,
// listboxes, citation remover).
import type { ReactNode } from 'react'
import type { Role } from '@shared/schemas/project'
import type { MselRow, Phase } from '@shared/schemas/scenario'
import { PURPOSE_TAGS, PURPOSE_TAG_INFO } from '@shared/taxonomy'
import { TagChip } from '../../components/ui'
import {
  CitationsEditor,
  ListCellEditor,
  TextCellEditor,
  type ListOption,
  type Move,
} from './CellEditors'
import {
  FORMAT_OPTIONS,
  citationItems,
  formatLabel,
  roleOptions,
  toDisplay,
  toValues,
  validateTime,
} from './cell-format'
import { CompactCitations, RowId, TimeView } from './cell-views'
import type { GridActions } from './grid-context'
import type { ColumnId } from './grid-nav'
import type { DraftRow } from './model'

const TAG_OPTIONS: ListOption[] = PURPOSE_TAGS.map((t) => ({
  value: t,
  label: PURPOSE_TAG_INFO[t].label,
  render: <TagChip tag={t} />,
  hint: PURPOSE_TAG_INFO[t].meaning,
}))

/** Columns whose editor is a popover anchored to the read-mode view. */
export const POPOVER_COLS = new Set<ColumnId>(['to', 'tag', 'format', 'citations'])

interface Handlers {
  onCommit: (v: unknown, move: Move) => void
  onCancel: () => void
}

function textEditorFor(h: Handlers, r: DraftRow, col: ColumnId): ReactNode {
  const row = r.row
  const text = (initial: string, label: string, multiline = false) => (
    <TextCellEditor {...h} initial={initial} label={label} multiline={multiline} />
  )
  switch (col) {
    case 'time':
      return (
        <TextCellEditor
          {...h}
          initial={row.time}
          label={`Time for ${row.id}`}
          validate={validateTime}
          hint="H:MM"
        />
      )
    case 'id':
      return (
        <TextCellEditor
          {...h}
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
    default:
      return null
  }
}

function listEditorFor(
  h: Handlers,
  r: DraftRow,
  col: ColumnId,
  roles: Role[],
  anchor: ReactNode,
): ReactNode {
  const row = r.row
  const common = { ...h, anchor }
  switch (col) {
    case 'to':
      return (
        <ListCellEditor
          {...common}
          label={`To for ${row.id}`}
          initial={toValues(row)}
          options={roleOptions(roles)}
          multiple
          exclusive={['__all__']}
        />
      )
    case 'tag':
      return (
        <ListCellEditor
          {...common}
          label={`Tag for ${row.id}`}
          initial={[row.purposeTag]}
          options={TAG_OPTIONS}
        />
      )
    case 'format':
      return (
        <ListCellEditor
          {...common}
          label={`Format for ${row.id}`}
          initial={[row.format ?? '']}
          options={FORMAT_OPTIONS}
          filterable
        />
      )
    default:
      return null
  }
}

function citationsEditorFor(h: Handlers, r: DraftRow, anchor: ReactNode): ReactNode {
  return (
    <CitationsEditor
      {...h}
      anchor={anchor}
      label={`Citations for ${r.row.id}`}
      items={citationItems(r.row.citations)}
      initial={r.row.citations.map((_, i) => i)}
    />
  )
}

/** The editor for `col` of row `r`; popover editors anchor to `anchor` (the read view). */
export function editorFor(
  g: GridActions,
  roles: Role[],
  r: DraftRow,
  col: ColumnId,
  anchor: ReactNode,
): ReactNode {
  const cell = { line: r.key, col }
  const h: Handlers = {
    onCommit: (v: unknown, move: Move) => g.commit(cell, v, move),
    onCancel: g.cancelEdit,
  }
  if (col === 'citations') return citationsEditorFor(h, r, anchor)
  return POPOVER_COLS.has(col) ? listEditorFor(h, r, col, roles, anchor) : textEditorFor(h, r, col)
}

export interface ViewContext {
  roles: Role[]
  phases: Phase[]
  warnings: string[] | undefined
}

/** The read-mode content of `col` for `row`. */
export function viewFor(row: MselRow, col: ColumnId, v: ViewContext): ReactNode {
  switch (col) {
    case 'time':
      return <TimeView row={row} phases={v.phases} />
    case 'id':
      return <RowId row={row} warnings={v.warnings} />
    case 'from':
      return row.from || <span className="muted">—</span>
    case 'to':
      return toDisplay(row, v.roles)
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
