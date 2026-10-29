// Small form controls shared by the structured editors.
import { clsx } from 'clsx'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import type { MselRow } from '@shared/schemas/scenario'
import { Button } from '../../../components/ui'
import { moveItem, replaceAt } from './list-utils'
import { resolveInjectId } from './rubric-rules'

/** A labelled single-line or multi-line text input. */
export function TextField(props: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  rows?: number
  hideLabel?: boolean
  /** Input type for single-line fields (email, tel, date, time). */
  type?: 'text' | 'email' | 'tel' | 'date' | 'time'
  /** Help text under the field, linked with aria-describedby. */
  hint?: string
}) {
  const id = useId()
  const hintId = props.hint ? `${id}-hint` : undefined
  return (
    <div className="field">
      <label className={clsx('field__label', props.hideLabel && 'sr-only')} htmlFor={id}>
        {props.label}
      </label>
      {props.multiline ? (
        <textarea
          id={id}
          className="textarea"
          rows={props.rows ?? 2}
          value={props.value}
          aria-describedby={hintId}
          onChange={(e) => props.onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          className="input"
          type={props.type ?? 'text'}
          value={props.value}
          aria-describedby={hintId}
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
      {props.hint && (
        <span id={hintId} className="field__hint">
          {props.hint}
        </span>
      )}
    </div>
  )
}

/** Move / remove buttons for an item in an editable list. */
export function ItemActions(props: {
  name: string
  index: number
  count: number
  onMove: (from: number, to: number) => void
  onRemove: (index: number) => void
}) {
  const { index: i } = props
  return (
    <div className="item-actions">
      <Button
        size="sm"
        icon
        variant="ghost"
        aria-label={`Move ${props.name} up`}
        disabled={i === 0}
        onClick={() => props.onMove(i, i - 1)}
      >
        <ArrowUp size={14} aria-hidden />
      </Button>
      <Button
        size="sm"
        icon
        variant="ghost"
        aria-label={`Move ${props.name} down`}
        disabled={i === props.count - 1}
        onClick={() => props.onMove(i, i + 1)}
      >
        <ArrowDown size={14} aria-hidden />
      </Button>
      <Button
        size="sm"
        icon
        variant="ghost"
        aria-label={`Remove ${props.name}`}
        onClick={() => props.onRemove(i)}
      >
        <X size={14} aria-hidden />
      </Button>
    </div>
  )
}

/** An editable list of short strings (standing orders, hard questions…). */
export function StringList(props: {
  label: string
  itemLabel: string
  items: string[]
  onChange: (items: string[]) => void
}) {
  return (
    <fieldset className="string-list">
      <legend className="field__label">{props.label}</legend>
      {props.items.map((text, i) => (
        <div className="string-list__item" key={i}>
          <TextField
            label={`${props.itemLabel} ${i + 1}`}
            hideLabel
            multiline
            value={text}
            onChange={(v) => props.onChange(replaceAt(props.items, i, v))}
          />
          <ItemActions
            name={`${props.itemLabel.toLowerCase()} ${i + 1}`}
            index={i}
            count={props.items.length}
            onMove={(a, b) => props.onChange(moveItem(props.items, a, b))}
            onRemove={(j) => props.onChange(props.items.filter((_, k) => k !== j))}
          />
        </div>
      ))}
      <Button size="sm" onClick={() => props.onChange([...props.items, ''])}>
        <Plus size={14} aria-hidden /> Add {props.itemLabel.toLowerCase()}
      </Button>
    </fieldset>
  )
}

/** Linked inject ids as removable chips; new ids must name an MSEL row. */
export function InjectChips(props: {
  label: string
  ids: string[]
  rows: Pick<MselRow, 'id'>[]
  onChange: (ids: string[]) => void
}) {
  const id = useId()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const known = new Set(props.rows.map((r) => r.id))

  function add() {
    const resolved = resolveInjectId(text, props.rows)
    if (!text.trim()) return
    if (!resolved) {
      setError(`${text.trim()} is not an inject in the MSEL.`)
      return
    }
    if (!props.ids.includes(resolved)) props.onChange([...props.ids, resolved])
    setText('')
    setError(null)
  }

  return (
    <div className="chips-field">
      <ul className="chips" aria-label={props.label}>
        {props.ids.map((x) => (
          <li
            key={x}
            className={clsx('chip', !known.has(x) && 'chip--invalid')}
            title={known.has(x) ? undefined : 'Not in the MSEL'}
          >
            <span>{x}</span>
            {!known.has(x) && <span className="sr-only"> (not in the MSEL)</span>}
            <button
              type="button"
              className="chip__remove"
              aria-label={`Remove ${x}`}
              onClick={() => props.onChange(props.ids.filter((y) => y !== x))}
            >
              <X size={12} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <input
        className="input chips__input"
        aria-label={`Add inject to ${props.label}`}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        list={`${id}-ids`}
        placeholder="I-07"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add()
          }
        }}
        onBlur={() => text.trim() && add()}
      />
      <datalist id={`${id}-ids`}>
        {props.rows.map((r) => (
          <option key={r.id} value={r.id} />
        ))}
      </datalist>
      {error && (
        <span id={`${id}-err`} className="field__error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted">{children}</p>
}
