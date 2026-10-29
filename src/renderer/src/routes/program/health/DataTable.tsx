// A sortable table for the health dashboard (#438, NFR-3): a real <table> with a caption, scoped
// headers and aria-sort buttons. Tables over PAGE rows show the first PAGE and a "Show more" button.
import { useMemo, useState, type ReactNode } from 'react'
import { Button } from '../../../components/ui'

const PAGE = 200

export interface Column<T> {
  key: string
  label: string
  /** Value used for sorting. */
  value: (row: T) => string | number
  /** What the cell shows; defaults to the sort value. */
  cell?: (row: T) => ReactNode
  align?: 'end'
}

type Dir = 'asc' | 'desc'

function compare(a: string | number, b: string | number): number {
  return typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), undefined, { numeric: true })
}

export function DataTable<T>(props: {
  caption: string
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  empty: string
}) {
  const [sort, setSort] = useState<{ key: string; dir: Dir } | null>(null)
  const [shown, setShown] = useState(PAGE)
  const sorted = useMemo(() => {
    const col = props.columns.find((c) => c.key === sort?.key)
    if (!col || !sort) return props.rows
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...props.rows].sort((a, b) => sign * compare(col.value(a), col.value(b)))
  }, [props.rows, props.columns, sort])
  if (!props.rows.length) return <p className="muted">{props.empty}</p>
  const toggle = (key: string) =>
    setSort((s) => (s?.key === key && s.dir === 'asc' ? { key, dir: 'desc' } : { key, dir: 'asc' }))
  const ariaSort = (key: string) =>
    sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
  return (
    <div className="health-scroll">
      <table className="table health-table">
        <caption className="sr-only">{props.caption}</caption>
        <thead>
          <tr>
            {props.columns.map((c) => (
              <th key={c.key} scope="col" aria-sort={ariaSort(c.key)}>
                <button type="button" className="program-sort" onClick={() => toggle(c.key)}>
                  {c.label}
                  <span aria-hidden>
                    {sort?.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, shown).map((row) => (
            <tr key={props.rowKey(row)}>
              {props.columns.map((c, i) =>
                i === 0 ? (
                  <th key={c.key} scope="row" className="health-rowhead">
                    {c.cell ? c.cell(row) : c.value(row)}
                  </th>
                ) : (
                  <td key={c.key} className={c.align === 'end' ? 'health-num' : undefined}>
                    {c.cell ? c.cell(row) : c.value(row)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length > shown && (
        <Button size="sm" onClick={() => setShown((n) => n + PAGE)}>
          Show more ({sorted.length - shown} not shown)
        </Button>
      )}
    </div>
  )
}
