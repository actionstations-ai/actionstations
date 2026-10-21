import { X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { normalizeTag } from './doc-utils'

/** Chip editor: Enter or comma adds a tag, Backspace on an empty input removes the last one. */
export function TagEditor(props: {
  tags: string[]
  onChange: (tags: string[]) => void
  label: string
  disabled?: boolean
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const tag = normalizeTag(draft, props.tags)
    setDraft('')
    if (tag) props.onChange([...props.tags, tag])
  }
  const remove = (tag: string) => props.onChange(props.tags.filter((t) => t !== tag))
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add()
    } else if (e.key === 'Backspace' && !draft && props.tags.length) {
      remove(props.tags[props.tags.length - 1]!)
    }
  }
  return (
    <div className="tag-editor" role="group" aria-label={props.label}>
      {props.tags.map((t) => (
        <span key={t} className="chip">
          {t}
          <button
            type="button"
            className="chip__remove"
            aria-label={`Remove tag ${t}`}
            disabled={props.disabled}
            onClick={() => remove(t)}
          >
            <X size={12} aria-hidden />
          </button>
        </span>
      ))}
      <input
        className="tag-editor__input"
        value={draft}
        placeholder={props.tags.length ? '+ tag' : 'Add tag'}
        aria-label={`Add tag to ${props.label}`}
        disabled={props.disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => draft && add()}
      />
    </div>
  )
}
