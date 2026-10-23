// List controls for the schema form: lists of strings, checkbox groups for lists of enum
// values, and the row editor for lists of objects (FIDS rows, radio lines, chat messages).
// Every row has keyboard-reachable move/remove buttons; "Add" focuses the new row.
import { Plus } from 'lucide-react'
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
import { RowActions } from './RowActions'
import { TableRows } from './RowTable'
import { itemNoun, moveItem, removeAt, replaceAt, type Fields } from './values'

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
