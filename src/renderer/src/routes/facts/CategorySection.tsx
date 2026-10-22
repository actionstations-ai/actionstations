// One category of facility-facts.md: its entries as editable lines with an origin badge and,
// for extracted ones, where the documents state them; an add box that takes one entry per
// line (paste a list); and extracted entries the file no longer has, each restorable.
import { Plus, RotateCcw, X } from 'lucide-react'
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import type { FacilityFactCategory } from '@shared/ipc/project'
import { Badge, Button } from '../../components/ui'
import { linesOf, missingExtracted, originOf, type DraftCategory } from './facts-draft'

export interface CategoryActions {
  onChange: (key: number, value: string) => void
  onRemove: (key: number) => void
  /** Adds lines; returns how many were new. */
  onAdd: (lines: string[]) => number
}

function sourceText(category: FacilityFactCategory | undefined, value: string): string | null {
  const source = category?.sources[value]
  if (!source) return null
  return source.section ? `${source.documentTitle} › ${source.section}` : source.documentTitle
}

function EntryRow(props: {
  label: string
  value: string
  index: number
  origin: 'extracted' | 'added'
  source: string | null
  error: string | undefined
  onChange: (value: string) => void
  onRemove: () => void
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
}) {
  const id = useId()
  const describedBy = [props.source && `${id}-src`, props.error && `${id}-err`, `${id}-origin`]
    .filter(Boolean)
    .join(' ')
  const name = props.value.trim() || `entry ${props.index + 1}`
  return (
    <li className="facts-entry">
      <div className="facts-entry__main">
        <input
          className="input facts-entry__input"
          value={props.value}
          aria-label={`${props.label} entry ${props.index + 1}`}
          aria-describedby={describedBy}
          aria-invalid={props.error ? true : undefined}
          data-entry-index={props.index}
          onChange={(e) => props.onChange(e.target.value)}
          onKeyDown={props.onKeyDown}
        />
        <span id={`${id}-origin`} className="facts-entry__origin">
          {props.origin === 'extracted' ? (
            <Badge>From documents</Badge>
          ) : (
            <Badge tone="ok">Added by you</Badge>
          )}
        </span>
        <Button
          size="sm"
          variant="ghost"
          icon
          aria-label={`Remove ${name} from ${props.label}`}
          title="Remove"
          onClick={props.onRemove}
        >
          <X size={16} aria-hidden />
        </Button>
      </div>
      {props.source && (
        <span id={`${id}-src`} className="facts-entry__source">
          Found in {props.source}
        </span>
      )}
      {props.error && (
        <span id={`${id}-err`} className="field__error">
          {props.error}
        </span>
      )}
    </li>
  )
}

function AddBox(props: { label: string; onAdd: (lines: string[]) => number }) {
  const id = useId()
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const add = () => {
    const lines = linesOf(text)
    if (!lines.length) return
    const added = props.onAdd(lines)
    const skipped = lines.length - added
    setText('')
    setNote(
      `Added ${added} ${added === 1 ? 'entry' : 'entries'}` +
        (skipped ? `; ${skipped} already listed.` : '.'),
    )
  }
  return (
    <div className="facts-add">
      <label className="field__label" htmlFor={id}>
        Add to {props.label}
      </label>
      <div className="facts-add__row">
        <textarea
          id={id}
          className="textarea facts-add__input"
          rows={1}
          value={text}
          aria-describedby={`${id}-hint`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              add()
            }
          }}
        />
        <Button onClick={add} disabled={!text.trim()}>
          <Plus size={16} aria-hidden /> Add
        </Button>
      </div>
      <span id={`${id}-hint`} className="field__hint">
        Enter adds; paste a list to add one entry per line (Shift+Enter for a new line).
      </span>
      <span className="sr-only" role="status">
        {note}
      </span>
    </div>
  )
}

export function CategorySection(props: {
  draft: DraftCategory
  category: FacilityFactCategory | undefined
  errors: Map<number, string>
  actions: CategoryActions
}) {
  const { draft, category, actions } = props
  const listRef = useRef<HTMLUListElement>(null)
  const headingId = useId()
  const missing = missingExtracted(category, draft)

  const focusEntry = (index: number) => {
    const inputs = listRef.current?.querySelectorAll<HTMLInputElement>('input[data-entry-index]')
    if (!inputs?.length) return
    inputs[Math.max(0, Math.min(index, inputs.length - 1))]?.focus()
  }

  const onEntryKey = (index: number, key: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault()
      focusEntry(index + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusEntry(index - 1)
    } else if (e.key === 'Backspace' && !e.currentTarget.value) {
      e.preventDefault()
      actions.onRemove(key)
      requestAnimationFrame(() => focusEntry(index - 1))
    }
  }

  return (
    <section className="card facts-category" aria-labelledby={headingId}>
      <header className="facts-category__header">
        <h2 id={headingId}>{draft.label}</h2>
        <span className="muted">
          {draft.entries.length} {draft.entries.length === 1 ? 'entry' : 'entries'}
        </span>
        {category?.linted ? (
          <Badge tone="info">Checked by lint</Badge>
        ) : (
          <span className="muted facts-category__kind">Shown to the model, not linted</span>
        )}
      </header>
      {draft.entries.length ? (
        <ul className="facts-entries" ref={listRef} aria-label={`${draft.label} entries`}>
          {draft.entries.map((e, i) => (
            <EntryRow
              key={e.key}
              label={draft.label}
              value={e.value}
              index={i}
              origin={originOf(category, e.value)}
              source={sourceText(category, e.value)}
              error={props.errors.get(e.key)}
              onChange={(v) => actions.onChange(e.key, v)}
              onRemove={() => {
                actions.onRemove(e.key)
                requestAnimationFrame(() => focusEntry(i))
              }}
              onKeyDown={onEntryKey(i, e.key)}
            />
          ))}
        </ul>
      ) : (
        <p className="muted">
          No entries. {category?.linted ? 'With an empty list, lint does not check this kind.' : ''}
        </p>
      )}
      <AddBox label={draft.label} onAdd={actions.onAdd} />
      {missing.length > 0 && (
        <div className="facts-missing">
          <p className="field__label">From the documents, not in your list</p>
          <ul className="facts-missing__list" aria-label={`${draft.label} removed from the list`}>
            {missing.map((value) => (
              <li key={value}>
                <span className="mono">{value}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => actions.onAdd([value])}
                  aria-label={`Restore ${value} to ${draft.label}`}
                >
                  <RotateCcw size={14} aria-hidden /> Restore
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
