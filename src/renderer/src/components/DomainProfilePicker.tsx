// Domain profile picker (#169): a search box over a grouped listbox of the built-in profiles
// (ADR-0014). Keyboard: type to filter, Up/Down/Home/End move the selection (selection
// follows the active option), Enter never submits the surrounding form.
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react'
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

type Groups = ReturnType<typeof profileGroups>
type Profile = Groups[number]['profiles'][number]

/** Keep the active option in view by scrolling only the list (not the page, on load). */
function useKeepInView(listRef: RefObject<HTMLDivElement | null>, active: string | undefined) {
  useEffect(() => {
    if (!active) return
    const list = listRef.current
    const el = list?.querySelector<HTMLElement>(`[data-profile="${active}"]`)
    if (!list || !el) return
    const top = el.offsetTop
    if (top < list.scrollTop) list.scrollTop = top
    else if (top + el.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = top + el.offsetHeight - list.clientHeight
  }, [listRef, active])
}

/** Up/Down/Home/End move the selection; Enter picks the first match and never submits. */
function keyHandler(
  flat: Profile[],
  active: string | undefined,
  query: string,
  onChange: (profileId: string) => void,
) {
  const move = (to: number) => {
    const next = flat[Math.max(0, Math.min(flat.length - 1, to))]
    if (next) onChange(next.id)
  }
  return (e: KeyboardEvent<HTMLInputElement>) => {
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
}

function PickerHead(props: { id: string; label: string; current: string }) {
  return (
    <div className="domain-picker__head">
      <label className="field__label" htmlFor={props.id}>
        {props.label}
      </label>
      {/* The current value stays visible while the search box is empty or filtering. */}
      <span className="domain-picker__current" data-testid="domain-current">
        <Check size={14} aria-hidden />
        <span className="sr-only">Selected: </span>
        {props.current}
      </span>
    </div>
  )
}

function ProfileOption(props: {
  p: Profile
  optionId: string
  selected: boolean
  onPick: () => void
}) {
  const { p, selected } = props
  return (
    <div
      id={props.optionId}
      data-profile={p.id}
      role="option"
      aria-selected={selected}
      className={clsx('domain-picker__option', selected && 'is-selected')}
      onClick={props.onPick}
    >
      <span className="domain-picker__label">{p.label}</span>
      {selected && <Check size={16} aria-hidden className="domain-picker__check" />}
      <span className="domain-picker__desc">{p.description}</span>
    </div>
  )
}

function ProfileList({
  ref,
  id,
  label,
  groups,
  query,
  selected,
  onChange,
}: {
  id: string
  label: string
  ref: RefObject<HTMLDivElement | null>
  groups: Groups
  query: string
  selected: string
  onChange: (profileId: string) => void
}) {
  return (
    <div
      id={`${id}-list`}
      ref={ref}
      role="listbox"
      aria-label={label}
      className="domain-picker__list"
      tabIndex={-1}
    >
      {groups.map((g, gi) => (
        <div key={g.label} role="group" aria-labelledby={`${id}-g${gi}`}>
          <div id={`${id}-g${gi}`} role="presentation" className="domain-picker__group">
            {g.label}
          </div>
          {g.profiles.map((p) => (
            <ProfileOption
              key={p.id}
              p={p}
              optionId={`${id}-opt-${p.id}`}
              selected={p.id === selected}
              onPick={() => onChange(p.id)}
            />
          ))}
        </div>
      ))}
      {groups.every((g) => g.profiles.length === 0) && (
        <p className="domain-picker__empty muted">
          No profile matches “{query}”. Try another word, or choose Generic organization.
        </p>
      )}
    </div>
  )
}

export function DomainProfilePicker(props: {
  /** The stored orgType (a profile id, a legacy value or an alias). */
  value: string
  onChange: (profileId: string) => void
  label?: string
}) {
  const id = useId()
  const label = props.label ?? 'Domain'
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const current = resolveOrgType(props.value).profile
  const selected = current.id
  const groups = useMemo(() => profileGroups(query), [query])
  const flat = groups.flatMap((g) => g.profiles)
  const active = flat.some((p) => p.id === selected) ? selected : undefined
  useKeepInView(listRef, active)

  return (
    <div className="field domain-picker">
      <PickerHead id={id} label={label} current={current.label} />
      <input
        id={id}
        className="input"
        type="search"
        role="combobox"
        aria-expanded="true"
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={active ? `${id}-opt-${active}` : undefined}
        aria-describedby={`${id}-hint`}
        placeholder="Search: bus, dam, hospital, drone…"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={keyHandler(flat, active, query, props.onChange)}
      />
      <span id={`${id}-hint`} className="field__hint">
        Sets the vocabulary, facility facts, roles, outside parties and threat families the
        generator uses. Arrow keys choose.
      </span>
      <ProfileList
        {...{ id, label, groups, query, selected }}
        ref={listRef}
        onChange={props.onChange}
      />
      <OrgTypeNote value={props.value} />
    </div>
  )
}
