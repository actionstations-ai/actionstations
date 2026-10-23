// Phase header line: select-all checkbox for the phase + title, window and editable goal.
// Memoized like MSEL rows (#201): it gets its own slice of the grid state as props.
import { useSortable } from '@dnd-kit/sortable'
import { clsx } from 'clsx'
import { memo } from 'react'
import type { Phase } from '@shared/schemas/scenario'
import { TextCellEditor } from './CellEditors'
import { useGridActions, useRowRef } from './grid-context'
import { COLUMNS, type ColumnId } from './grid-nav'
import { phaseLineKey } from './model'

export interface PhaseRowProps {
  phase: Phase
  /** Rows in the phase, and how many of them are selected. */
  total: number
  picked: number
  rowIndex: number
  activeCol: ColumnId | null
  editing: boolean
  measure?: ((el: HTMLElement | null) => void) | undefined
}

function PhaseRowViewImpl(props: PhaseRowProps) {
  const { phase, total, picked, measure } = props
  const g = useGridActions()
  const line = phaseLineKey(phase.id)
  const { setNodeRef } = useSortable({ id: line, disabled: { draggable: true } })
  const ref = useRowRef(setNodeRef, measure)
  const selectActive = props.activeCol === 'select'
  const goalActive = props.activeCol !== null && !selectActive
  const title = `Phase ${phase.index + 1}: ${phase.title}`
  return (
    <tr
      ref={ref}
      className="msel-editor__phase"
      data-row-key={line}
      aria-rowindex={props.rowIndex}
      data-index={props.rowIndex - 2}
    >
      <PhaseSelect
        phase={phase}
        title={title}
        total={total}
        picked={picked}
        active={selectActive}
      />
      <td
        role="gridcell"
        colSpan={COLUMNS.length - 1}
        data-cell={`${line}|event`}
        className={clsx('msel-editor__phase-cell', goalActive && 'is-active')}
        tabIndex={goalActive ? 0 : -1}
        onFocus={() => !goalActive && g.activate({ line, col: 'event' })}
        onDoubleClick={() => g.startEdit({ line, col: 'event' })}
      >
        <PhaseGoal phase={phase} title={title} line={line} editing={props.editing} />
      </td>
    </tr>
  )
}

function PhaseSelect(props: {
  phase: Phase
  title: string
  total: number
  picked: number
  active: boolean
}) {
  const { phase, total, picked, active } = props
  const g = useGridActions()
  const line = phaseLineKey(phase.id)
  return (
    <td role="gridcell" data-cell={`${line}|select`} className="msel-editor__c-select">
      <input
        type="checkbox"
        aria-label={`Select all rows in ${props.title}`}
        data-focus
        tabIndex={active ? 0 : -1}
        disabled={!total}
        checked={total > 0 && picked === total}
        ref={(el) => {
          if (el) el.indeterminate = picked > 0 && picked < total
        }}
        onFocus={() => !active && g.activate({ line, col: 'select' })}
        onChange={() => g.togglePhaseSelect(phase.id)}
      />
    </td>
  )
}

function PhaseGoal(props: { phase: Phase; title: string; line: string; editing: boolean }) {
  const { phase, title, line } = props
  const g = useGridActions()
  return (
    <>
      <span className="msel-editor__phase-title" role="heading" aria-level={3}>
        {title}{' '}
        <span className="muted">
          (Hour {phase.startTime} – {phase.endTime})
        </span>
      </span>
      {props.editing ? (
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
    </>
  )
}

export const PhaseRowView = memo(PhaseRowViewImpl)
