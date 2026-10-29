/**
 * Preferences that persist across sessions in `localStorage` (theme, sound, vibration, text
 * size) and nothing else (NFR-2). Every read and write is guarded: private windows and blocked
 * storage must not break the page.
 */
export type Theme = 'system' | 'light' | 'dark'
export type TextSize = 'normal' | 'large'

export interface Prefs {
  theme: Theme
  sound: boolean
  vibration: boolean
  textSize: TextSize
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  sound: false,
  vibration: true,
  textSize: 'normal',
}

const KEY = 'as-player:prefs'

export interface PrefsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function storage(): PrefsStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export function loadPrefs(store: PrefsStorage | undefined = storage()): Prefs {
  try {
    const raw = store?.getItem(KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<Prefs>
    return {
      theme: ['system', 'light', 'dark'].includes(parsed.theme as string)
        ? (parsed.theme as Theme)
        : DEFAULT_PREFS.theme,
      sound: typeof parsed.sound === 'boolean' ? parsed.sound : DEFAULT_PREFS.sound,
      vibration: typeof parsed.vibration === 'boolean' ? parsed.vibration : DEFAULT_PREFS.vibration,
      textSize: parsed.textSize === 'large' ? 'large' : 'normal',
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(prefs: Prefs, store: PrefsStorage | undefined = storage()): void {
  try {
    store?.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // storage blocked: the choice lasts for this page only
  }
}

/**
 * Reflect the theme and text size on `<html>`. The theme bootstrap in `index.html` does the
 * same before the bundle loads so a dark choice never flashes light.
 */
export function applyPrefs(prefs: Prefs, root: HTMLElement | undefined = documentRoot()): void {
  if (!root) return
  if (prefs.theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', prefs.theme)
  if (prefs.textSize === 'large') root.setAttribute('data-text', 'large')
  else root.removeAttribute('data-text')
}

function documentRoot(): HTMLElement | undefined {
  return typeof document === 'undefined' ? undefined : document.documentElement
}
