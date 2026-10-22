// An ARIA toolbar with roving tabindex: Tab enters/leaves it as one stop, arrow keys,
// Home and End move between its buttons.
import { clsx } from 'clsx'
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface ToolbarItem {
  id: string
  label: string
  icon: ReactNode
  /** Keyboard shortcut shown in the tooltip, e.g. "⌘B". */
  shortcut?: string
  pressed?: boolean
  disabled?: boolean
  onRun: () => void
  /** Starts a new visual group. */
  group?: boolean
}

const NEXT: Record<string, (i: number, n: number) => number> = {
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowLeft: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_, n) => n - 1,
}

export function Toolbar(props: { label: string; controls?: string; items: ToolbarItem[] }) {
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const current = Math.min(active, props.items.length - 1)

  function onKeyDown(e: KeyboardEvent) {
    const move = NEXT[e.key]
    if (!move) return
    e.preventDefault()
    const next = move(current, props.items.length)
    setActive(next)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="toolbar"
      aria-label={props.label}
      aria-controls={props.controls}
      className="doc-toolbar"
      onKeyDown={onKeyDown}
    >
      {props.items.map((item, i) => (
        <button
          key={item.id}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          className={clsx('doc-toolbar__btn', item.group && 'doc-toolbar__btn--group')}
          tabIndex={i === current ? 0 : -1}
          aria-label={item.label}
          title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
          aria-pressed={item.pressed === undefined ? undefined : item.pressed}
          aria-disabled={item.disabled || undefined}
          onFocus={() => setActive(i)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => !item.disabled && item.onRun()}
        >
          {item.icon}
        </button>
      ))}
    </div>
  )
}
