// The table editor for tabular lists of objects (FIDS rows, radio lines): one row per item,
// one bare control per field, and the row errors listed under the table.
import { useContext } from 'react'
import type { FieldSpec, ObjectListField } from './fields'
import { IssuesContext, labelOf } from './form-context'
import { RowActions } from './RowActions'
import {
  moveItem,
  numberOrText,
  parseNumber,
  removeAt,
  replaceAt,
  setKey,
  type Fields,
} from './values'

interface CellProps {
  spec: FieldSpec
  value: unknown
  label: string
  error?: string
  onChange: (v: unknown) => void
}

const ariaOf = (p: CellProps) => ({
  'aria-label': p.label,
  'aria-invalid': !!p.error || undefined,
  title: p.error,
})

function EnumCell(props: CellProps & { options: readonly unknown[] }) {
  const { value, onChange } = props
  return (
    <select
      {...ariaOf(props)}
      className="select"
      value={value === undefined ? '' : String(value)}
      onChange={(e) => onChange(props.options.find((o) => String(o) === e.target.value))}
    >
      <option value="">—</option>
      {props.options.map((o) => (
        <option key={String(o)} value={String(o)}>
          {String(o)}
        </option>
      ))}
    </select>
  )
}

/** One cell of a tabular row: a bare control labelled "<Rows> 2: <Gate>". */
function Cell(props: CellProps) {
  const { spec, value, onChange } = props
  const aria = ariaOf(props)
  if (spec.kind === 'boolean')
    return (
      <input
        type="checkbox"
        {...aria}
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
      />
    )
  if (spec.kind === 'enum') return <EnumCell {...props} options={spec.options} />
  if (spec.kind === 'number')
    return (
      <input
        {...aria}
        type="number"
        className="input"
        value={typeof value === 'number' ? value : ''}
        onChange={(e) => onChange(parseNumber(e.target.value, spec.integer))}
      />
    )
  return (
    <input
      {...aria}
      className="input"
      value={value === undefined ? '' : String(value)}
      onChange={(e) =>
        onChange(spec.kind === 'number-or-text' ? numberOrText(e.target.value) : e.target.value)
      }
    />
  )
}

export interface RowsProps {
  spec: ObjectListField
  list: Fields[]
  path: string
  noun: string
  update: (next: unknown[]) => void
}

function TableHead(props: { spec: ObjectListField }) {
  return (
    <thead>
      <tr>
        <th scope="col" className="row-table__n">
          #
        </th>
        {props.spec.item.fields.map((f) => (
          <th key={f.name} scope="col" title={f.description}>
            {labelOf(f)}
          </th>
        ))}
        <th scope="col">
          <span className="sr-only">Actions</span>
        </th>
      </tr>
    </thead>
  )
}

function TableRow(props: RowsProps & { item: Fields; index: number }) {
  const { spec, list, path, noun, update, item, index: i } = props
  const issues = useContext(IssuesContext)
  return (
    <tr data-row={i}>
      <td className="row-table__n mono">{i + 1}</td>
      {spec.item.fields.map((f) => (
        <td key={f.name}>
          <Cell
            spec={f}
            value={item[f.name]}
            label={`${spec.label} ${i + 1}: ${f.label}`}
            error={issues.get(`${path}/${i}/${f.name}`)}
            onChange={(v) => update(replaceAt(list, i, setKey(item, f.name, v, f.required)))}
          />
        </td>
      ))}
      <td>
        <RowActions
          index={i}
          count={list.length}
          noun={noun}
          canRemove={list.length > (spec.minItems ?? 0)}
          onMove={(d) => update(moveItem(list, i, d))}
          onRemove={() => update(removeAt(list, i))}
        />
      </td>
    </tr>
  )
}

export function TableRows(props: RowsProps) {
  const { spec, list, path, noun } = props
  const issues = useContext(IssuesContext)
  const rowErrors = list.flatMap((_, i) =>
    spec.item.fields
      .map((f) => [f, issues.get(`${path}/${i}/${f.name}`)] as const)
      .filter(([, e]) => e)
      .map(([f, e]) => `${noun} ${i + 1} · ${f.label}: ${e}`),
  )
  return (
    <>
      <div className="row-table__scroll">
        <table className="row-table">
          <TableHead spec={spec} />
          <tbody>
            {list.map((item, i) => (
              <TableRow key={i} {...props} item={item} index={i} />
            ))}
          </tbody>
        </table>
      </div>
      {rowErrors.length > 0 && (
        <ul className="row-table__errors field__error">
          {rowErrors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </>
  )
}
