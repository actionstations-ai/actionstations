// The criteria the MSEL grid shows (#421): fetched once, grouped by row, and the Criteria
// column's on/off state (remembered per device).
import { useCallback, useMemo, useState } from 'react'
import type { RowCriterion } from '@shared/schemas/evaluation'
import { useIpcQuery } from '../../lib/query'

const SHOW_KEY = 'ttx.msel.criteria'

function readShow(): boolean {
  try {
    return localStorage.getItem(SHOW_KEY) === '1'
  } catch {
    return false
  }
}

/** The criteria by row id, and whether the Criteria column is shown (remembered per device). */
export function useCriteria(projectPath: string, scenarioId: string) {
  const query = useIpcQuery('evaluation:criteria', { projectPath, scenarioId })
  const [show, setShow] = useState(readShow)
  const toggle = useCallback(() => {
    setShow((on) => {
      try {
        localStorage.setItem(SHOW_KEY, on ? '0' : '1')
      } catch {
        // Storage may be unavailable; the toggle still works for this session.
      }
      return !on
    })
  }, [])
  const byRow = useMemo(() => {
    const map = new Map<string, RowCriterion[]>()
    for (const c of query.data ?? []) map.set(c.rowId, [...(map.get(c.rowId) ?? []), c])
    return map
  }, [query.data])
  return { byRow, show, toggle }
}

/** Critical task ids of a row's criteria; a row with only its own expected action has none. */
export const taskIdsOf = (list: readonly RowCriterion[] | undefined): string[] =>
  (list ?? []).flatMap((c) => (c.taskId ? [c.taskId] : []))
