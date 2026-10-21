import { clsx } from 'clsx'
import { useState, type KeyboardEvent } from 'react'

/**
 * Text that becomes an input on click. Enter or blur commits, Escape cancels.
 * Commits only when the trimmed value changed.
 */
export function InlineText(props: {
  value: string
  onCommit: (value: string) => void
  label: string
  placeholder?: string
  allowEmpty?: boolean
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(props.value)
  const start = () => {
    setDraft(props.value)
    setEditing(true)
  }
  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next === props.value.trim()) return
    if (!next && !props.allowEmpty) return
    props.onCommit(next)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit()
    else if (e.key === 'Escape') setEditing(false)
  }
  if (editing) {
    return (
      <input
        className={clsx('inline-text__input', props.className)}
        aria-label={props.label}
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
    )
  }
  return (
    <button
      type="button"
      className={clsx('inline-text', !props.value && 'inline-text--empty', props.className)}
      aria-label={`${props.label}: ${props.value || 'empty'}. Click to edit`}
      onClick={(e) => {
        e.stopPropagation()
        start()
      }}
    >
      {props.value || props.placeholder || '—'}
    </button>
  )
}
