// List controls for the schema form: lists of strings, checkbox groups for lists of enum
// values, and the row editor for lists of objects (FIDS rows, radio lines, chat messages).
// Every row has keyboard-reachable move/remove buttons; "Add" focuses the new row.
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useContext, useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/ui'
import {
  emptyValue,
  type EnumListField,
  type FieldSpec,
  type ObjectListField,
  type StringListField,
} from './fields'
import { IssuesContext, labelOf, useIssue, type ControlProps } from './form-context'
import { FieldControl, ObjectBody } from './SchemaForm'
import {
  itemNoun,
  moveItem,
  numberOrText,
  parseNumber,
  removeAt,
  replaceAt,
  setKey,
  type Fields,
} from './values'

const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** After "Add", move focus into the new row so keyboard users can type straight away. */
function useFocusNewRow(count: number) {
  const container = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState<number | null>(null)
  useEffect(() => {
    if (pending === null || pending >= count) return
    const row = container.current?.querySelector<HTMLElement>(`[data-row="${pending}"]`)
    row?.querySelector<HTMLElement>('input, textarea, select')?.focus()
  }, [pending, count])
  return { container, focusRow: setPending }
}

function RowActions(props: {
  index: number
  count: number
  noun: string
  onMove: (delta: number) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const n = props.index + 1
  return (
    <div className="row-actions">
      <Button
        size="sm"
        variant="ghost"
        icon
        aria-label={`Move ${props.noun} ${n} up`}
        disabled={props.index === 0}
        onClick={() => props.onMove(-1)}
      >
        <ArrowUp size={14} aria-hidden />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon
        aria-label={`Move ${props.noun} ${n} down`}
        disabled={props.index === props.count - 1}
        onClick={() => props.onMove(1)}
      >
        <ArrowDown size={14} aria-hidden />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon
        aria-label={`Remove ${props.noun} ${n}`}
        disabled={!props.canRemove}
        onClick={props.onRemove}
      >
        <Trash2 size={14} aria-hidden />
      </Button>
    </div>
  )
}

function ListHeader(props: { spec: FieldSpec; error?: string; count: number; max?: number }) {
  return (
    <>
      <legend>
        {labelOf(props.spec)}{' '}
        <span className="muted">
          ({props.count}
          {props.max !== undefined ? ` of max ${props.max}` : ''})
        </span>
      </legend>
      {props.spec.description && <p className="field__hint">{props.spec.description}</p>}
      {props.error && (
        <p className="field__error" role="alert">
          {props.error}
        </p>
      )}
    </>
  )
}

export function StringListEditor({ spec, value, onChange, path }: ControlProps<StringListField>) {
  const error = useIssue(path)
  const issues = useContext(IssuesContext)
  const list = asList(value)
  const noun = itemNoun(spec.label)
  const { container, focusRow } = useFocusNewRow(list.length)
  const update = (next: unknown[]) => onChange(next.length || spec.required ? next : undefined)
  const full = spec.maxItems !== undefined && list.length >= spec.maxItems
  return (
    <fieldset className="schema-form__group">
      <ListHeader spec={spec} error={error} count={list.length} max={spec.maxItems} />
      <div className="string-list" ref={container}>
        {list.map((item, i) => (
          <div key={i} className="string-list__row" data-row={i}>
            <StringItem
              label={`${spec.label} ${i + 1}`}
              value={typeof item === 'string' ? item : String(item ?? '')}
              textarea={spec.item.widget === 'textarea'}
              error={issues.get(`${path}/${i}`)}
              onChange={(v) => update(replaceAt(list, i, v))}
            />
            <RowActions
              index={i}
              count={list.length}
              noun={noun}
              canRemove={list.length > (spec.minItems ?? 0)}
              onMove={(d) => update(moveItem(list, i, d))}
              onRemove={() => update(removeAt(list, i))}
            />
          </div>
        ))}
      </div>
      <div className="row">
        <Button
          size="sm"
          disabled={full}
          onClick={() => {
            update([...list, ''])
            focusRow(list.length)
          }}
        >
          <Plus size={14} aria-hidden /> Add {noun}
        </Button>
      </div>
    </fieldset>
  )
}

function StringItem(props: {
  label: string
  value: string
  textarea: boolean
  error: string | undefined
  onChange: (v: string) => void
}) {
  const common = {
    'aria-label': props.label,
    'aria-invalid': !!props.error || undefined,
    title: props.error,
    value: props.value,
  }
  return props.textarea ? (
    <textarea
      {...common}
      className="textarea"
      rows={2}
      onChange={(e) => props.onChange(e.target.value)}
    />
  ) : (
    <input {...common} className="input" onChange={(e) => props.onChange(e.target.value)} />
  )
}

export function EnumListEditor({ spec, value, onChange, path }: ControlProps<EnumListField>) {
  const error = useIssue(path)
  const list = asList(value).map(String)
  const toggle = (opt: string, on: boolean) => {
    const next = on ? [...list, opt] : list.filter((x) => x !== opt)
    // Keep the schema's option order so the rendered result is stable.
    const ordered = spec.options.filter((o) => next.includes(o))
    onChange(ordered.length || spec.required ? ordered : undefined)
  }
  return (
    <fieldset className="schema-form__group">
      <ListHeader spec={spec} error={error} count={list.length} max={spec.maxItems} />
      <div className="ie-checkbox-group">
        {spec.options.map((opt) => (
          <label key={opt} className="ie-checkbox">
            <input
              type="checkbox"
              checked={list.includes(opt)}
              onChange={(e) => toggle(opt, e.target.checked)}
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** One cell of a tabular row: a bare control labelled "<Rows> 2: <Gate>". */
function Cell(props: {
  spec: FieldSpec
  value: unknown
  label: string
  error?: string
  onChange: (v: unknown) => void
}) {
  const { spec, value, label, error, onChange } = props
  const aria = { 'aria-label': label, 'aria-invalid': !!error || undefined, title: error }
  if (spec.kind === 'boolean')
    return (
      <input
        type="checkbox"
        {...aria}
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
      />
    )
  if (spec.kind === 'enum')
    return (
      <select
        {...aria}
        className="select"
        value={value === undefined ? '' : String(value)}
        onChange={(e) => onChange(spec.options.find((o) => String(o) === e.target.value))}
      >
        <option value="">—</option>
        {spec.options.map((o) => (
          <option key={String(o)} value={String(o)}>
            {String(o)}
          </option>
        ))}
      </select>
    )
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

function TableRows(props: {
  spec: ObjectListField
  list: Fields[]
  path: string
  noun: string
  update: (next: unknown[]) => void
}) {
  const { spec, list, path, noun, update } = props
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
          <thead>
            <tr>
              <th scope="col" className="row-table__n">
                #
              </th>
              {spec.item.fields.map((f) => (
                <th key={f.name} scope="col" title={f.description}>
                  {labelOf(f)}
                </th>
              ))}
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((item, i) => (
              <tr key={i} data-row={i}>
                <td className="row-table__n mono">{i + 1}</td>
                {spec.item.fields.map((f) => (
                  <td key={f.name}>
                    <Cell
                      spec={f}
                      value={item[f.name]}
                      label={`${spec.label} ${i + 1}: ${f.label}`}
                      error={issues.get(`${path}/${i}/${f.name}`)}
                      onChange={(v) =>
                        update(replaceAt(list, i, setKey(item, f.name, v, f.required)))
                      }
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

function CardRows(props: {
  spec: ObjectListField
  list: Fields[]
  path: string
  noun: string
  update: (next: unknown[]) => void
}) {
  const { spec, list, path, noun, update } = props
  return (
    <div className="row-cards">
      {list.map((item, i) => (
        <fieldset key={i} className="row-card" data-row={i}>
          <legend className="row-card__legend">
            <span>
              {noun[0]!.toUpperCase() + noun.slice(1)} {i + 1}
            </span>
          </legend>
          <RowActions
            index={i}
            count={list.length}
            noun={noun}
            canRemove={list.length > (spec.minItems ?? 0)}
            onMove={(d) => update(moveItem(list, i, d))}
            onRemove={() => update(removeAt(list, i))}
          />
          {spec.item.fields.length ? (
            <ObjectBody
              spec={spec.item}
              value={item}
              path={`${path}/${i}`}
              onChange={(next) => update(replaceAt(list, i, next))}
            />
          ) : (
            <FieldControl
              spec={spec.item}
              value={item}
              path={`${path}/${i}`}
              onChange={(v) => update(replaceAt(list, i, v))}
            />
          )}
        </fieldset>
      ))}
    </div>
  )
}

export function ObjectListEditor({ spec, value, onChange, path }: ControlProps<ObjectListField>) {
  const error = useIssue(path)
  const list = asList(value).map((v) => (v && typeof v === 'object' ? (v as Fields) : {}))
  const noun = itemNoun(spec.label)
  const { container, focusRow } = useFocusNewRow(list.length)
  const update = (next: unknown[]) => onChange(next.length || spec.required ? next : undefined)
  const full = spec.maxItems !== undefined && list.length >= spec.maxItems
  const Rows = spec.tabular ? TableRows : CardRows
  return (
    <fieldset className="schema-form__group">
      <ListHeader spec={spec} error={error} count={list.length} max={spec.maxItems} />
      <div ref={container}>
        <Rows spec={spec} list={list} path={path} noun={noun} update={update} />
      </div>
      <div className="row">
        <Button
          size="sm"
          disabled={full}
          onClick={() => {
            update([...list, emptyValue(spec.item)])
            focusRow(list.length)
          }}
        >
          <Plus size={14} aria-hidden /> Add {noun}
        </Button>
      </div>
    </fieldset>
  )
}
