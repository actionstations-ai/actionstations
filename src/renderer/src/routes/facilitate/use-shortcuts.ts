// Facilitator single-key shortcuts: Space start/pause, N next due, D deliver selected,
// R record / pause / resume the hot wash recording and Shift+R stop it (#425), Shift+D deliver
// to a chosen set of roles, [ ] move the clock 1 minute (Shift: 5), A mark answered and C add a
// commitment (spec 0428).
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
  /** Start (opens the consent dialog), pause or resume the hot wash recording. */
  record?: () => void
  /** Stop the hot wash recording. */
  stopRecording?: () => void
  /** Open the "Deliver to…" picker for the selected row (spec 0428). */
  deliverTo?: () => void
  /** Move the clock by this many minutes; negative moves it back. */
  nudge?: (deltaMin: number) => void
  /** Mark the selected row answered. */
  answer?: () => void
  /** Add a commitment. */
  commitment?: () => void
}

/** Minutes a bracket key moves the clock: [ and ] are 1, Shift+[ and Shift+] are 5. */
function nudgeDelta(k: string, shift: boolean): number | undefined {
  // Shift+[ types "{" and Shift+] types "}" on a US keyboard.
  if (k === '[' || k === '{') return shift || k === '{' ? -5 : -1
  if (k === ']' || k === '}') return shift || k === '}' ? 5 : 1
  return undefined
}

/** The handler a key press maps to, or undefined when the key is not a shortcut. */
function handlerFor(keys: ShortcutKeys, k: string, shift: boolean): (() => void) | undefined {
  if (k === 'r') return shift ? keys.stopRecording : keys.record
  if (k === ' ') return keys.toggle
  if (k === 'n') return keys.next
  if (k === 'd') return shift ? keys.deliverTo : keys.deliver
  if (k === 'a') return keys.answer
  if (k === 'c') return keys.commitment
  const delta = nudgeDelta(k, shift)
  const nudge = keys.nudge
  if (delta !== undefined && nudge) return () => nudge(delta)
  return undefined
}

/** Space start/pause, N next due, D deliver selected, R / Shift+R recorder — never while typing. */
export function useShortcuts(keys: ShortcutKeys, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      const k = e.key.toLowerCase()
      if (k === ' ' && ownsSpace(e.target)) return
      const run = handlerFor(keys, k, e.shiftKey)
      if (!run) return
      run()
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keys, enabled])
}
