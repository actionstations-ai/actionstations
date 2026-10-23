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

type TextEditorProps = EditorProps<string> & {
  multiline?: boolean
  validate?: (value: string) => string | null
  hint?: string
}

/** Commit / cancel rules of the text editor: Enter, Tab, Escape and blur. */
function useTextCommit(props: TextEditorProps, value: string) {
  const [error, setError] = useState<string | null>(null)
  const done = useRef(false)
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
  return { error, setError, commit, onKeyDown }
}

/** Single-line input or auto-growing textarea. `validate` returning a message blocks commit. */
export function TextCellEditor(props: TextEditorProps) {
  const [value, setValue] = useState(props.initial)
  const { error, setError, commit, onKeyDown } = useTextCommit(props, value)
  const errId = useId()
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

/** A popover anchored to the cell: Escape cancels, closing it any other way commits. */
function EditorPopover(props: {
  anchor: ReactNode
  onClose: () => void
  onEscape: () => void
  onKeyDown: (e: KeyboardEvent) => void
  children: ReactNode
}) {
  return (
    <Popover.Root open onOpenChange={(open) => !open && props.onClose()}>
      <Popover.Anchor asChild>{props.anchor}</Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          className="msel-editor__popover"
          align="start"
          sideOffset={2}
          onEscapeKeyDown={(e) => {
            e.preventDefault()
            props.onEscape()
          }}
          onKeyDown={props.onKeyDown}
        >
          {props.children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Values, filter and active option of a list editor, and how it ends. */
function useListEditor(props: ListEditorProps) {
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
  return { values, filter, setFilter, shown, active, setActive, finish, cancel, pick }
}

type ListEditor = ReturnType<typeof useListEditor>

function listKeyHandler(props: ListEditorProps, l: ListEditor, typeahead: (k: string) => void) {
  return (e: KeyboardEvent) => {
    e.stopPropagation()
    const last = l.shown.length - 1
    if (e.key === 'ArrowDown') l.setActive((i) => Math.min(last, i + 1))
    else if (e.key === 'ArrowUp') l.setActive((i) => Math.max(0, i - 1))
    else if (e.key === 'Home') l.setActive(0)
    else if (e.key === 'End') l.setActive(last)
    else if (e.key === ' ' && !props.filterable) l.pick(l.active)
    else if (e.key === 'Enter') l.finish(props.multiple ? l.values : l.pick(l.active), null)
    else if (e.key === 'Tab') l.finish(l.values, tabMove(e))
    else if (e.key === 'Escape') l.cancel()
    else if (!props.filterable && e.key.length === 1 && !e.metaKey && !e.ctrlKey) typeahead(e.key)
    else return
    e.preventDefault()
  }
}

function OptionList(props: { editor: ListEditorProps; l: ListEditor; listId: string }) {
  const { editor: p, l, listId } = props
  const activeId = l.shown[l.active] ? `${listId}-${l.active}` : undefined
  return (
    <ul
      id={listId}
      role="listbox"
      aria-label={p.label}
      aria-multiselectable={p.multiple || undefined}
      aria-activedescendant={activeId}
      tabIndex={p.filterable ? -1 : 0}
      autoFocus={!p.filterable}
      className="msel-editor__list"
    >
      {l.shown.map((o, i) => (
        <li
          key={o.value}
          id={`${listId}-${i}`}
          role="option"
          aria-selected={l.values.includes(o.value)}
          data-active={i === l.active || undefined}
          className="msel-editor__option"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            l.setActive(i)
            const next = l.pick(i)
            if (!p.multiple) l.finish(next, null)
          }}
        >
          {p.multiple && (
            <span className="msel-editor__check" aria-hidden>
              {l.values.includes(o.value) ? '☑' : '☐'}
            </span>
          )}
          {o.render ?? o.label}
          {o.hint && <span className="muted msel-editor__hint">{o.hint}</span>}
        </li>
      ))}
      {!l.shown.length && <li className="muted msel-editor__option">No matches</li>}
    </ul>
  )
}

/** Single or multi select listbox in a popover anchored to the cell. */
export function ListCellEditor(props: ListEditorProps) {
  const l = useListEditor(props)
  const listId = useId()
  const typeahead = useTypeahead(l.shown, l.setActive)
  const activeId = l.shown[l.active] ? `${listId}-${l.active}` : undefined
  return (
    <EditorPopover
      anchor={props.anchor}
      onClose={() => l.finish(l.values, 'blur')}
      onEscape={l.cancel}
      onKeyDown={listKeyHandler(props, l, typeahead)}
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
          value={l.filter}
          onChange={(e) => {
            l.setFilter(e.target.value)
            l.setActive(0)
          }}
        />
      )}
      <OptionList editor={props} l={l} listId={listId} />
      {props.multiple && (
        <p className="muted msel-editor__help">Space toggles · Enter saves · Esc cancels</p>
      )}
    </EditorPopover>
  )
}

export interface CitationItem {
  label: string
  title: string
}

type CitationsProps = EditorProps<number[]> & { items: CitationItem[]; anchor: ReactNode }

/** Kept citations, the active one, and how the editor ends. */
function useCitations(props: CitationsProps) {
  const [kept, setKept] = useState(props.initial)
  const [active, setActive] = useState(0)
  const done = useRef(false)
  const finish = (move: Move) => {
    if (done.current) return
    done.current = true
    props.onCommit(kept, move)
  }
  const cancel = () => {
    done.current = true
    props.onCancel()
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
    else if (e.key === 'Escape') cancel()
    else return
    e.preventDefault()
  }
  return { kept, active, finish, cancel, remove, onKeyDown }
}

/** Remove citations: arrows move, Delete / Backspace removes, Enter or Esc closes. */
export function CitationsEditor(props: CitationsProps) {
  const { kept, active, finish, cancel, remove, onKeyDown } = useCitations(props)
  const listId = useId()
  return (
    <EditorPopover
      anchor={props.anchor}
      onClose={() => finish('blur')}
      onEscape={cancel}
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
        {kept.map((idx, i) => (
          <CitationOption
            key={idx}
            id={`${listId}-${i}`}
            item={props.items[idx]!}
            active={i === active}
            onRemove={() => remove(i)}
          />
        ))}
        {!kept.length && <li className="muted msel-editor__option">No citations</li>}
      </ul>
      <p className="muted msel-editor__help">Delete removes · Enter saves · Esc cancels</p>
    </EditorPopover>
  )
}

function CitationOption(props: {
  id: string
  item: CitationItem
  active: boolean
  onRemove: () => void
}) {
  const { item, active } = props
  return (
    <li
      id={props.id}
      role="option"
      aria-selected={active}
      data-active={active || undefined}
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
        onClick={props.onRemove}
      >
        <X size={12} aria-hidden />
      </button>
    </li>
  )
}
