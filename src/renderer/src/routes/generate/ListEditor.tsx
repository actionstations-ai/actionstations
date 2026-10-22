import { useId, useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../components/ui'
import './list-editor.css'

/** Editable list of short strings: type + Enter (or Add) appends; each item removable. */
export function ListEditor(props: {
  label: string
  items: string[]
  onChange: (items: string[]) => void
  placeholder?: string
  hint?: string
  /** "chips" renders inline pills (audience roles); "list" renders one item per line. */
  variant?: 'chips' | 'list'
  suggestions?: string[]
}) {
  const id = useId()
  const [text, setText] = useState('')
  const add = (value = text) => {
    const v = value.trim()
    if (v && !props.items.includes(v)) props.onChange([...props.items, v])
    setText('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      add()
    }
  }
  const remaining = (props.suggestions ?? []).filter((s) => !props.items.includes(s))
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {props.label}
      </label>
      {props.items.length > 0 && (
        <ul
          className={props.variant === 'chips' ? 'chip-list' : 'line-list'}
          aria-label={props.label}
        >
          {props.items.map((item) => (
            <li key={item} className={props.variant === 'chips' ? 'chip' : 'line-item'}>
              <span>{item}</span>
              <button
                type="button"
                className="chip__remove"
                aria-label={`Remove ${item}`}
                onClick={() => props.onChange(props.items.filter((i) => i !== item))}
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <input
          id={id}
          className="input"
          value={text}
          placeholder={props.placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        <Button size="sm" onClick={() => add()} disabled={!text.trim()}>
          Add
        </Button>
      </div>
      {remaining.length > 0 && (
        <div className="row suggestions" aria-label={`Suggested ${props.label.toLowerCase()}`}>
          {remaining.map((s) => (
            <button key={s} type="button" className="chip chip--suggest" onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
      {props.hint && <span className="field__hint">{props.hint}</span>}
    </div>
  )
}
