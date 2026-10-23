#!/usr/bin/env node
// WCAG contrast check of the renderer's design tokens (#49), light and dark.
//
// Pairs come from two places:
//  1. every CSS rule in src/renderer/src that sets both `color` and `background` from tokens
//     (text pairs, 4.5:1), plus every rule that sets only a text `color` token, checked on the
//     four page surfaces it can sit on;
//  2. a curated list of context pairs a rule-level scan cannot see (text inside tinted rows,
//     UI boundaries and focus rings at 3:1).
// Usage: node scripts/check-contrast.mjs   (exits 1 and lists violations)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const RENDERER = join(ROOT, 'src/renderer/src')
const TOKENS = join(RENDERER, 'styles/tokens.css')

export const TEXT_MIN = 4.5
export const UI_MIN = 3

const SURFACES = [
  '--color-bg',
  '--color-surface',
  '--color-surface-raised',
  '--color-surface-sunken',
]

/** Text colors that only ever sit on the background named in the same rule. */
const PAIRED_ONLY = new Set(['--color-text-inverse'])

/** Context pairs: [foreground, background, minimum, where]. */
export const CONTEXT_PAIRS = [
  ...SURFACES.flatMap((bg) => [
    ['--color-text', bg, TEXT_MIN, 'body text'],
    ['--color-text-muted', bg, TEXT_MIN, 'secondary text'],
    ['--color-accent', bg, TEXT_MIN, 'links'],
    ['--color-danger', bg, TEXT_MIN, 'error text'],
    ['--color-border-strong', bg, UI_MIN, 'input and button borders'],
    ['--color-focus', bg, UI_MIN, 'focus ring'],
  ]),
  ['--color-text', '--color-accent-soft', TEXT_MIN, 'text on selected rows / highlighted items'],
  ['--color-text-muted', '--color-accent-soft', TEXT_MIN, 'secondary text on selected rows'],
  ['--color-accent', '--color-accent-soft', TEXT_MIN, 'info badge'],
  ['--color-focus', '--color-accent-soft', UI_MIN, 'focus ring on a selected row'],
  ['--color-accent', '--color-accent-soft', UI_MIN, 'selected-row bar and check'],
  ['--color-text', '--color-hover', TEXT_MIN, 'text on a hovered list option'],
  ['--color-text-muted', '--color-hover', TEXT_MIN, 'secondary text on a hovered option'],
  ['--color-focus', '--color-hover', UI_MIN, 'focus ring on a hovered option'],
  ['--color-text', '--color-danger-soft', TEXT_MIN, 'text in error banners'],
  ['--color-danger', '--color-danger-soft', TEXT_MIN, 'error badge'],
  ['--color-text', '--color-warning-soft', TEXT_MIN, 'text in warning banners'],
  ['--color-warning', '--color-warning-soft', TEXT_MIN, 'warning badge'],
  ['--color-text', '--color-success-soft', TEXT_MIN, 'text in success banners'],
  ['--color-success', '--color-success-soft', TEXT_MIN, 'success badge'],
  ['--color-text-inverse', '--color-accent', TEXT_MIN, 'primary button'],
  ['--color-text-inverse', '--color-accent-hover', TEXT_MIN, 'primary button (hover)'],
  ['--color-accent', '--color-surface', UI_MIN, 'selected indicators, progress'],
  // The sidebar is navy in every theme; its tokens only ever sit on its own two grounds.
  ...['--sidebar-bg', '--sidebar-hover'].flatMap((bg) => [
    ['--sidebar-text', bg, TEXT_MIN, 'sidebar navigation'],
    ['--sidebar-text-muted', bg, TEXT_MIN, 'sidebar section labels'],
    ['--sidebar-accent', bg, TEXT_MIN, 'sidebar tagline, current item, focus'],
  ]),
  ['--color-danger', '--color-surface', UI_MIN, 'invalid input border'],
  ...[
    'core',
    'noise',
    'herring',
    'pressure',
    'misinfo',
    'clue',
    'hurdle',
    'decision',
    'control',
  ].map((t) => [`--tag-${t}-fg`, `--tag-${t}-bg`, TEXT_MIN, `purpose tag ${t}`]),
]

// ---- color math -----------------------------------------------------------------------------

export function hexToRgb(hex) {
  let h = hex.replace('#', '').trim()
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Not a hex color: ${hex}`)
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

function luminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(a, b) {
  const [l1, l2] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

// ---- token parsing --------------------------------------------------------------------------

function declarations(block) {
  const out = {}
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[m[1]] = m[2].trim()
  return out
}

function blockAfter(css, marker) {
  const start = css.indexOf(marker)
  if (start < 0) throw new Error(`tokens.css: missing ${marker}`)
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  throw new Error(`tokens.css: unterminated block after ${marker}`)
}

/** Resolved hex values per theme: { light, dark, darkAttr }. */
export function readThemes(css = readFileSync(TOKENS, 'utf8')) {
  const base = declarations(blockAfter(css, ':root {'))
  const light = { ...base, ...declarations(blockAfter(css, ":root[data-theme='light']")) }
  const media = blockAfter(css, '@media (prefers-color-scheme: dark)')
  const dark = { ...light, ...declarations(blockAfter(media, ":root:not([data-theme='light'])")) }
  const attrStart = css.lastIndexOf(":root[data-theme='dark']")
  const darkAttr = {
    ...light,
    ...declarations(blockAfter(css.slice(attrStart), ":root[data-theme='dark']")),
  }
  return { light, dark, darkAttr }
}

// ---- pairs used by the stylesheets ---------------------------------------------------------

function cssFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return cssFiles(p)
    return name.endsWith('.css') && name !== 'tokens.css' ? [p] : []
  })
}

const tokenOf = (value) => value?.match(/^var\((--[a-z0-9-]+)\)$/)?.[1]

/** [fg, bg, min, where] for every rule that colors text from tokens. */
export function rulePairs(files = cssFiles(RENDERER)) {
  const pairs = []
  for (const file of files) {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const decl = Object.fromEntries(
        [...m[2].matchAll(/(?:^|;)\s*([a-z-]+)\s*:\s*([^;]+)/g)].map((d) => [d[1], d[2].trim()]),
      )
      const fg = tokenOf(decl.color)
      if (!fg || fg.startsWith('--shadow')) continue
      const bg = tokenOf(decl.background) ?? tokenOf(decl['background-color'])
      const where = `${relative(ROOT, file)} ${m[1].trim().split('\n').pop()}`
      if (bg) pairs.push([fg, bg, TEXT_MIN, where])
      else if (!PAIRED_ONLY.has(fg) && !fg.startsWith('--tag-') && !fg.startsWith('--sidebar-'))
        for (const s of SURFACES) pairs.push([fg, s, TEXT_MIN, where])
    }
  }
  return pairs
}

// ---- check ---------------------------------------------------------------------------------

/** Every violation as a readable line; empty when all pairs pass in every theme. */
export function contrastViolations(
  themes = readThemes(),
  pairs = [...CONTEXT_PAIRS, ...rulePairs()],
) {
  const out = new Set()
  for (const [theme, tokens] of Object.entries(themes)) {
    for (const [fg, bg, min, where] of pairs) {
      const a = tokens[fg]
      const b = tokens[bg]
      if (!a || !b) {
        out.add(`[${theme}] unknown token ${!a ? fg : bg} (${where})`)
        continue
      }
      const ratio = contrastRatio(a, b)
      if (ratio + 1e-9 < min)
        out.add(`[${theme}] ${fg} ${a} on ${bg} ${b} = ${ratio.toFixed(2)}:1 < ${min}:1 (${where})`)
    }
  }
  return [...out]
}

/** The two dark blocks (media query and data-theme) must define the same values. */
export function darkThemeDrift(themes = readThemes()) {
  return Object.keys(themes.dark)
    .filter((k) => themes.dark[k] !== themes.darkAttr[k])
    .map((k) => `${k}: media ${themes.dark[k]} vs [data-theme=dark] ${themes.darkAttr[k]}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = [...contrastViolations(), ...darkThemeDrift()]
  if (problems.length) {
    console.error(`✖ ${problems.length} contrast problem(s):\n  ${problems.join('\n  ')}`)
    process.exit(1)
  }
  console.log('✔ token contrast: every pair meets WCAG AA in light and dark')
}
