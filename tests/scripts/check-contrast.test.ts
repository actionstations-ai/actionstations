// scripts/check-contrast.mjs: WCAG AA contrast of the design tokens in light and dark (#49).
import { describe, expect, it } from 'vitest'
import {
  CONTEXT_PAIRS,
  contrastRatio,
  contrastViolations,
  darkThemeDrift,
  readThemes,
  rulePairs,
} from '../../scripts/check-contrast.mjs'

describe('contrast math', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
    expect(contrastRatio('#fff', '#ffffff')).toBe(1)
  })

  it('reports a pair below the minimum with its theme, tokens and location', () => {
    const themes = { light: { '--a': '#999999', '--b': '#ffffff' } }
    const problems = contrastViolations(themes, [['--a', '--b', 4.5, 'demo rule']])
    expect(problems).toEqual(['[light] --a #999999 on --b #ffffff = 2.85:1 < 4.5:1 (demo rule)'])
  })

  it('reports tokens a pair names but the theme does not define', () => {
    const problems = contrastViolations({ light: { '--a': '#000000' } }, [
      ['--a', '--missing', 3, 'x'],
    ])
    expect(problems[0]).toMatch(/unknown token --missing/)
  })
})

describe('renderer tokens', () => {
  const themes = readThemes()

  it('parses the light, dark (media query) and dark (data-theme) blocks', () => {
    for (const t of [themes.light, themes.dark, themes.darkAttr]) {
      expect(t['--color-text']).toMatch(/^#[0-9a-f]{6}$/i)
      expect(t['--color-surface']).toMatch(/^#[0-9a-f]{6}$/i)
    }
    expect(themes.light['--color-text']).not.toBe(themes.dark['--color-text'])
  })

  it('collects text pairs from the stylesheets', () => {
    const pairs = rulePairs()
    expect(pairs.length).toBeGreaterThan(100)
    expect(
      pairs.some(([fg, bg]) => fg === '--color-success' && bg === '--color-success-soft'),
    ).toBe(true)
    expect(CONTEXT_PAIRS.some(([fg]) => fg === '--color-focus')).toBe(true)
  })

  it('every used pair meets WCAG AA (text 4.5:1, UI 3:1) in both themes', () => {
    expect(contrastViolations({ ...themes })).toEqual([])
  })

  it('keeps the two dark blocks identical', () => {
    expect(darkThemeDrift(themes)).toEqual([])
  })
})
