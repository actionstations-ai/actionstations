import { describe, expect, it } from 'vitest'
import { applyPrefs, DEFAULT_PREFS, loadPrefs, savePrefs, type PrefsStorage } from './prefs'

function memory(): PrefsStorage & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) }
}

describe('preferences', () => {
  it('defaults: system theme, sound off, vibration on, normal text', () => {
    expect(loadPrefs(memory())).toEqual(DEFAULT_PREFS)
    expect(DEFAULT_PREFS.sound).toBe(false)
  })

  it('round-trips through storage and ignores values it does not know', () => {
    const store = memory()
    savePrefs({ theme: 'dark', sound: true, vibration: false, textSize: 'large' }, store)
    expect(loadPrefs(store)).toEqual({
      theme: 'dark',
      sound: true,
      vibration: false,
      textSize: 'large',
    })
    store.map.set(
      'as-player:prefs',
      JSON.stringify({ theme: 'neon', textSize: 'huge', sound: 'yes' }),
    )
    expect(loadPrefs(store)).toEqual(DEFAULT_PREFS)
    store.map.set('as-player:prefs', '{not json')
    expect(loadPrefs(store)).toEqual(DEFAULT_PREFS)
  })

  it('survives a storage that throws (private window, blocked site data)', () => {
    const broken: PrefsStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadPrefs(broken)).toEqual(DEFAULT_PREFS)
    expect(() => savePrefs(DEFAULT_PREFS, broken)).not.toThrow()
  })

  it('reflects theme and text size on the root element', () => {
    const attrs = new Map<string, string>()
    const root = {
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      removeAttribute: (k: string) => void attrs.delete(k),
    } as unknown as HTMLElement
    applyPrefs({ ...DEFAULT_PREFS, theme: 'dark', textSize: 'large' }, root)
    expect(attrs.get('data-theme')).toBe('dark')
    expect(attrs.get('data-text')).toBe('large')
    applyPrefs(DEFAULT_PREFS, root)
    expect(attrs.has('data-theme')).toBe(false)
    expect(attrs.has('data-text')).toBe(false)
  })
})
