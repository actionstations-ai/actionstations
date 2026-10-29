// Evaluation criteria in the MSEL grid (#421): the read-only "Criteria" column a toolbar toggle
// shows, and the criteria line under a row's expected action. Both read the criteria main derives
// from the EEGs (`evaluation:criteria`), so the grid never holds a second copy.
import { useGridShared } from './grid-context'
import { taskIdsOf } from './criteria-model'

/** The read-only Criteria cell: task ids, or "Expected action" when no task maps to the row. */
export function CriteriaCell({ rowId }: { rowId: string }) {
  const list = useGridShared().criteria?.get(rowId)
  const ids = taskIdsOf(list)
  return (
    <td role="gridcell" data-col="criteria" className="msel-editor__c-criteria">
      {ids.length ? (
        <span title={list!.map((c) => c.text).join('\n')}>{ids.join(', ')}</span>
      ) : list?.length ? (
        <span className="muted">Expected action</span>
      ) : (
        <span className="muted">—</span>
      )}
    </td>
  )
}

/** "Criteria: T-01, T-04" under the expected action when evaluation guides link tasks to the row. */
export function CriteriaLine({ rowId }: { rowId: string }) {
  const list = useGridShared().criteria?.get(rowId)
  const ids = taskIdsOf(list)
  if (!ids.length) return null
  return (
    <span className="msel-editor__criteria-line" title={list!.map((c) => c.text).join('\n')}>
      Criteria: {ids.join(', ')}
    </span>
  )
}
