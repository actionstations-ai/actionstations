// In-cell editors. Enter commits (Shift+Enter = newline in text areas), Tab / Shift+Tab
// commit and move to the next editable cell, Escape cancels, blur commits.
import { Popover } from 'radix-ui'
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** How editing ended: Tab / Shift+Tab, focus left the editor ('blur'), or Enter (null). */
export type Move = 'next' | 'prev' | 'blur' | null

export interface EditorProps<T> {
  label: string
  initial: T
  onCommit: (value: T, move: Move) => void
  onCancel: () => void
}

const tabMove = (e: KeyboardEvent): Move => (e.shiftKey ? 'prev' : 'next')

function growToFit(el: HTMLTextAreaElement | null): void {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + 2}px`
}

/** Single-line input or auto-growing textarea. `validate` returning a message blocks commit. */
export function TextCellEditor(
  props: EditorProps<string> & {
    multiline?: boolean
    validate?: (value: string) => string | null
    hint?: string
  },
) {
  const [value, setValue] = useState(props.initial)
  const [error, setError] = useState<string | null>(null)
  const done = useRef(false)
  const errId = useId()
  const commit = (move: Move, fromBlur = false) => {
    if (done.current) return
    const problem = props.validate?.(value) ?? null
    if (problem) {
      if (fromBlur) {
        done.current = true
        props.onCancel()
      } else setError(problem)
      return
    }
    done.current = true
    props.onCommit(value, fromBlur ? 'blur' : move)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.stopPropagation()
    if (e.key === 'Enter' && !(props.multiline && e.shiftKey)) {
      e.preventDefault()
      commit(null)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      commit(tabMove(e))
    } else if (e.key === 'Escape') {
      e.preventDefault()
      done.current = true
      props.onCancel()
    }
  }
  const common = {
    'aria-label': props.label,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errId : undefined,
    value,
    autoFocus: true,
    onKeyDown,
    onBlur: () => commit(null, true),
  }
  return (
    <div className="msel-editor__cell-edit">
      {props.multiline ? (
        <textarea
          {...common}
          className="textarea msel-editor__textarea"
          ref={growToFit}
          rows={2}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setValue(e.target.value)
            growToFit(e.target)
          }}
        />
      ) : (
        <input
          {...common}
          className="input msel-editor__input"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
        />
      )}
      {error && (
        <span id={errId} className="field__error" role="alert">
          {error}
        </span>
      )}
      {!error && props.hint && <span className="field__hint">{props.hint}</span>}
    </div>
  )
}

export interface ListOption {
  value: string
  label: string
  /** Rich rendering in the list (e.g. a TagChip). */
  render?: ReactNode
  hint?: string
}

interface ListEditorProps extends EditorProps<string[]> {
  options: ListOption[]
  multiple?: boolean
  /** Show a filter box (combobox) above the list. */
  filterable?: boolean
  /** Values that clear every other value when chosen ("All"). */
  exclusive?: string[]
  anchor: ReactNode
}

function toggle(values: string[], v: string, multiple: boolean, exclusive: string[]): string[] {
  if (!multiple) return [v]
  if (values.includes(v)) return values.filter((x) => x !== v)
  if (exclusive.includes(v)) return [v]
  return [...values.filter((x) => !exclusive.includes(x)), v]
}

function useTypeahead(options: ListOption[], setActive: (i: number) => void) {
  const buffer = useRef({ text: '', at: 0 })
  return (key: string) => {
    const now = Date.now()
    const b = buffer.current
    b.text = now - b.at > 700 ? key : b.text + key
    b.at = now
    const i = options.findIndex((o) => o.label.toLowerCase().startsWith(b.text.toLowerCase()))
    if (i >= 0) setActive(i)
  }
}

/** Single or multi select listbox in a popover anchored to the cell. */
export function ListCellEditor(props: ListEditorProps) {
  const [values, setValues] = useState(props.initial)
  const [filter, setFilter] = useState('')
  const shown = useMemo(
    () =>
      props.options.filter((o) =>
        `${o.label} ${o.value}`.toLowerCase().includes(filter.trim().toLowerCase()),
      ),
    [props.options, filter],
  )
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      props.options.findIndex((o) => o.value === props.initial[0]),
    ),
  )
  const done = useRef(false)
  const listId = useId()
  const typeahead = useTypeahead(shown, setActive)
  const finish = (next: string[], move: Move) => {
    if (done.current) return
    done.current = true
    props.onCommit(next, move)
  }
  const cancel = () => {
    if (done.current) return
    done.current = true
    props.onCancel()
  }
  const pick = (i: number) => {
    const o = shown[i]
    if (!o) return values
    const next = toggle(values, o.value, !!props.multiple, props.exclusive ?? [])
    setValues(next)
    return next
  }
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation()
    const last = shown.length - 1
    if (e.key === 'ArrowDown') setActive((i) => Math.min(last, i + 1))
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1))
    else if (e.key === 'Home') setActive(0)
    else if (e.key === 'End') setActive(last)
    else if (e.key === ' ' && !props.filterable) pick(active)
    else if (e.key === 'Enter') finish(props.multiple ? values : pick(active), null)
    else if (e.key === 'Tab') finish(values, tabMove(e))
    else if (e.key === 'Escape') cancel()
    else if (!props.filterable && e.key.length === 1 && !e.metaKey && !e.ctrlKey) typeahead(e.key)
    else return
    e.preventDefault()
  }
  const activeId = shown[active] ? `${listId}-${active}` : undefined
  return (
    <Popover.Root open onOpenChange={(open) => !open && finish(values, 'blur')}>
      <Popover.Anchor asChild>{props.anchor}</Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          className="msel-editor__popover"
          align="start"
          sideOffset={2}
          onEscapeKeyDown={(e) => {
            e.preventDefault()
            cancel()
          }}
          onKeyDown={onKeyDown}
        >
          {props.filterable && (
            <input
              className="input msel-editor__filter"
              role="combobox"
              aria-label={`Filter ${props.label}`}
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={activeId}
              autoFocus
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value)
                setActive(0)
              }}
            />
          )}
          <ul
            id={listId}
            role="listbox"
            aria-label={props.label}
            aria-multiselectable={props.multiple || undefined}
            aria-activedescendant={activeId}
            tabIndex={props.filterable ? -1 : 0}
            autoFocus={!props.filterable}
            className="msel-editor__list"
          >
            {shown.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={values.includes(o.value)}
                data-active={i === active || undefined}
                className="msel-editor__option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setActive(i)
                  const next = pick(i)
                  if (!props.multiple) finish(next, null)
                }}
              >
                {props.multiple && (
                  <span className="msel-editor__check" aria-hidden>
                    {values.includes(o.value) ? '☑' : '☐'}
                  </span>
                )}
                {o.render ?? o.label}
                {o.hint && <span className="muted msel-editor__hint">{o.hint}</span>}
              </li>
            ))}
            {!shown.length && <li className="muted msel-editor__option">No matches</li>}
          </ul>
          {props.multiple && (
            <p className="muted msel-editor__help">Space toggles · Enter saves · Esc cancels</p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export interface CitationItem {
  label: string
  title: string
}

/** Remove citations: arrows move, Delete / Backspace removes, Enter or Esc closes. */
export function CitationsEditor(
  props: EditorProps<number[]> & { items: CitationItem[]; anchor: ReactNode },
) {
  const [kept, setKept] = useState(props.initial)
  const [active, setActive] = useState(0)
  const done = useRef(false)
  const listId = useId()
  const finish = (move: Move) => {
    if (done.current) return
    done.current = true
    props.onCommit(kept, move)
  }
  const remove = (pos: number) => {
    setKept((k) => k.filter((_, i) => i !== pos))
    setActive((a) => Math.max(0, Math.min(a, kept.length - 2)))
  }
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'ArrowDown') setActive((i) => Math.min(kept.length - 1, i + 1))
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1))
    else if (e.key === 'Delete' || e.key === 'Backspace') remove(active)
    else if (e.key === 'Enter') finish(null)
    else if (e.key === 'Tab') finish(tabMove(e))
    else if (e.key === 'Escape') {
      done.current = true
      props.onCancel()
    } else return
    e.preventDefault()
  }
  return (
    <Popover.Root open onOpenChange={(open) => !open && finish('blur')}>
      <Popover.Anchor asChild>{props.anchor}</Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          className="msel-editor__popover"
          align="start"
          sideOffset={2}
          onEscapeKeyDown={(e) => {
            e.preventDefault()
            done.current = true
            props.onCancel()
          }}
          onKeyDown={onKeyDown}
        >
          <ul
            id={listId}
            role="listbox"
            aria-label={props.label}
            tabIndex={0}
            autoFocus
            aria-activedescendant={kept.length ? `${listId}-${active}` : undefined}
            className="msel-editor__list"
          >
            {kept.map((idx, i) => {
              const item = props.items[idx]!
              return (
                <li
                  key={idx}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  data-active={i === active || undefined}
                  className="msel-editor__option"
                  title={item.title}
                >
                  <span>{item.label}</span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm btn--icon msel-editor__remove"
                    aria-label={`Remove citation ${item.label}`}
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => remove(i)}
                  >
                    <X size={12} aria-hidden />
                  </button>
                </li>
              )
            })}
            {!kept.length && <li className="muted msel-editor__option">No citations</li>}
          </ul>
          <p className="muted msel-editor__help">Delete removes · Enter saves · Esc cancels</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
