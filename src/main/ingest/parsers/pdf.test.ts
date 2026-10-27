import { describe, expect, it } from 'vitest'
import { skipCanvasSystemFonts } from './pdf'

describe('skipCanvasSystemFonts (#373)', () => {
  it('turns off the canvas system-font scan on Linux, where it crashes Electron', () => {
    const env: NodeJS.ProcessEnv = {}
    skipCanvasSystemFonts(env, 'linux')
    expect(env.DISABLE_SYSTEM_FONTS_LOAD).toBe('1')
  })

  it('leaves macOS and Windows on system fonts', () => {
    for (const platform of ['darwin', 'win32'] as const) {
      const env: NodeJS.ProcessEnv = {}
      skipCanvasSystemFonts(env, platform)
      expect(env.DISABLE_SYSTEM_FONTS_LOAD).toBeUndefined()
    }
  })

  it('keeps a value the user already set', () => {
    const env: NodeJS.ProcessEnv = { DISABLE_SYSTEM_FONTS_LOAD: '' }
    skipCanvasSystemFonts(env, 'linux')
    expect(env.DISABLE_SYSTEM_FONTS_LOAD).toBe('')
  })
})
