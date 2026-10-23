// Facilitator single-key shortcuts: Space start/pause, N next due, D deliver selected.
import { useEffect, useState } from 'react'

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

/** Space on a focused button, link, tab or checkbox belongs to that control. */
const ownsSpace = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  !!el.closest('button, a[href], summary, [role="tab"], [role="button"], [role="checkbox"]')

export const SHORTCUTS_KEY = 'ttx.facilitate.singleKeyShortcuts'

/** Single-key shortcuts can be switched off (WCAG 2.1.4); the choice is kept on this computer. */
export function useShortcutsEnabled(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(SHORTCUTS_KEY) !== 'off'
    } catch {
      return true
    }
  })
  const set = (next: boolean) => {
    setOn(next)
    try {
      localStorage.setItem(SHORTCUTS_KEY, next ? 'on' : 'off')
    } catch {
      /* storage unavailable: the choice lasts for this session */
    }
  }
  return [on, set]
}

export interface ShortcutKeys {
  toggle: () => void
  next: () => void
  deliver: () => void
}

/** Space start/pause, N next due, D deliver selected — never while typing. */
export function useShortcuts(keys: ShortcutKeys, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      const k = e.key.toLowerCase()
      if (k === ' ' && ownsSpace(e.target)) return
      if (k === ' ') keys.toggle()
      else if (k === 'n') keys.next()
      else if (k === 'd') keys.deliver()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keys, enabled])
}
