// Phase header line: select-all checkbox for the phase + title, window and editable goal.
import { useSortable } from '@dnd-kit/sortable'
import { clsx } from 'clsx'
import type { Phase } from '@shared/schemas/scenario'
import { TextCellEditor } from './CellEditors'
import { isCell, useGrid } from './grid-context'
import { COLUMNS } from './grid-nav'
import { phaseLineKey } from './model'

export function PhaseRowView(props: { phase: Phase; rowKeys: string[] }) {
  const { phase, rowKeys } = props
  const g = useGrid()
  const line = phaseLineKey(phase.id)
  const { setNodeRef } = useSortable({ id: line, disabled: { draggable: true } })
  const picked = rowKeys.filter((k) => g.selected.has(k)).length
  const selectActive = isCell(g.active, line, 'select')
  const goalActive = !!g.active && g.active.line === line && g.active.col !== 'select'
  const editing = !!g.editing && g.editing.line === line
  const title = `Phase ${phase.index + 1}: ${phase.title}`
  return (
    <tr ref={setNodeRef} className="msel-editor__phase" data-row-key={line}>
      <td role="gridcell" data-cell={`${line}|select`} className="msel-editor__c-select">
        <input
          type="checkbox"
          aria-label={`Select all rows in ${title}`}
          data-focus
          tabIndex={selectActive ? 0 : -1}
          disabled={!rowKeys.length}
          checked={rowKeys.length > 0 && picked === rowKeys.length}
          ref={(el) => {
            if (el) el.indeterminate = picked > 0 && picked < rowKeys.length
          }}
          onFocus={() => !selectActive && g.activate({ line, col: 'select' })}
          onChange={() => g.togglePhaseSelect(phase.id)}
        />
      </td>
      <td
        role="gridcell"
        colSpan={COLUMNS.length - 1}
        data-cell={`${line}|event`}
        className={clsx('msel-editor__phase-cell', goalActive && 'is-active')}
        tabIndex={goalActive ? 0 : -1}
        onFocus={() => !goalActive && g.activate({ line, col: 'event' })}
        onDoubleClick={() => g.startEdit({ line, col: 'event' })}
      >
        <span className="msel-editor__phase-title" role="heading" aria-level={3}>
          {title}{' '}
          <span className="muted">
            (Hour {phase.startTime} – {phase.endTime})
          </span>
        </span>
        {editing ? (
          <TextCellEditor
            label={`Goal for ${title}`}
            initial={phase.goal}
            multiline
            onCommit={(v) => g.commit({ line, col: 'event' }, v, null)}
            onCancel={g.cancelEdit}
          />
        ) : (
          <span className="msel-editor__phase-goal">
            Goal: {phase.goal || <span className="muted">none (press Enter to add)</span>}
          </span>
        )}
      </td>
    </tr>
  )
}
