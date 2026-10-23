// Domain profile picker (#169): a search box over a grouped listbox of the built-in profiles
// (ADR-0014). Keyboard: type to filter, Up/Down/Home/End move the selection (selection
// follows the active option), Enter never submits the surrounding form.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { clsx } from 'clsx'
import { Check } from 'lucide-react'
import { profileGroups, resolveOrgType } from '../lib/domains'
import './domain.css'

function OrgTypeNote({ value }: { value: string }) {
  const resolved = resolveOrgType(value)
  if (!resolved.differs) return null
  return (
    <p className="field__hint" data-testid="orgtype-note">
      {resolved.unknown
        ? `Saved as “${value}”, which no profile names, so the ${resolved.profile.label} profile applies. Pick a profile to replace it.`
        : `Saved as “${value}”, which uses the ${resolved.profile.label} profile.`}
    </p>
  )
}

export function DomainProfilePicker(props: {
  /** The stored orgType (a profile id, a legacy value or an alias). */
  value: string
  onChange: (profileId: string) => void
  label?: string
}) {
  const id = useId()
  const listId = `${id}-list`
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const current = resolveOrgType(props.value).profile
  const selected = current.id
  const groups = useMemo(() => profileGroups(query), [query])
  const flat = groups.flatMap((g) => g.profiles)
  const optionId = (pid: string) => `${id}-opt-${pid}`
  const active = flat.some((p) => p.id === selected) ? selected : undefined

  useEffect(() => {
    if (!active) return
    const list = listRef.current
    const el = list?.querySelector<HTMLElement>(`[data-profile="${active}"]`)
    if (!list || !el) return
    // Scroll only the list: scrollIntoView would also scroll the page to the picker on load.
    const top = el.offsetTop
    if (top < list.scrollTop) list.scrollTop = top
    else if (top + el.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = top + el.offsetHeight - list.clientHeight
  }, [active])

  const move = (to: number) => {
    const next = flat[Math.max(0, Math.min(flat.length - 1, to))]
    if (next) props.onChange(next.id)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const i = flat.findIndex((p) => p.id === active)
    const keys: Record<string, () => void> = {
      ArrowDown: () => move(i < 0 ? 0 : i + 1),
      ArrowUp: () => move(i < 0 ? flat.length - 1 : i - 1),
      Home: () => move(0),
      End: () => move(flat.length - 1),
      Enter: () => (i < 0 && flat.length > 0 ? move(0) : undefined),
    }
    const run = keys[e.key]
    // With text typed, Home/End keep moving the caret.
    const caretKey = (e.key === 'Home' || e.key === 'End') && query !== ''
    if (!run || caretKey) return
    e.preventDefault()
    run()
  }

  return (
    <div className="field domain-picker">
      <div className="domain-picker__head">
        <label className="field__label" htmlFor={id}>
          {props.label ?? 'Domain'}
        </label>
        {/* The current value stays visible while the search box is empty or filtering. */}
        <span className="domain-picker__current" data-testid="domain-current">
          <Check size={14} aria-hidden />
          <span className="sr-only">Selected: </span>
          {current.label}
        </span>
      </div>
      <input
        id={id}
        className="input"
        type="search"
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active ? optionId(active) : undefined}
        aria-describedby={`${id}-hint`}
        placeholder="Search: bus, dam, hospital, drone…"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKey}
      />
      <span id={`${id}-hint`} className="field__hint">
        Sets the vocabulary, facility facts, roles, outside parties and threat families the
        generator uses. Arrow keys choose.
      </span>
      <div
        id={listId}
        ref={listRef}
        role="listbox"
        aria-label={props.label ?? 'Domain'}
        className="domain-picker__list"
        tabIndex={-1}
      >
        {groups.map((g, gi) => (
          <div key={g.label} role="group" aria-labelledby={`${id}-g${gi}`}>
            <div id={`${id}-g${gi}`} role="presentation" className="domain-picker__group">
              {g.label}
            </div>
            {g.profiles.map((p) => (
              <div
                key={p.id}
                id={optionId(p.id)}
                data-profile={p.id}
                role="option"
                aria-selected={p.id === selected}
                className={clsx('domain-picker__option', p.id === selected && 'is-selected')}
                onClick={() => props.onChange(p.id)}
              >
                <span className="domain-picker__label">{p.label}</span>
                {p.id === selected && (
                  <Check size={16} aria-hidden className="domain-picker__check" />
                )}
                <span className="domain-picker__desc">{p.description}</span>
              </div>
            ))}
          </div>
        ))}
        {flat.length === 0 && (
          <p className="domain-picker__empty muted">
            No profile matches “{query}”. Try another word, or choose Generic organization.
          </p>
        )}
      </div>
      <OrgTypeNote value={props.value} />
    </div>
  )
}
