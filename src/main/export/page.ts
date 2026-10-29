// Page setup for exported PDFs: US Letter, running header (scenario title · EXERCISE marking ·
// document name) and footer (organization · version · date · page X of Y) as CSS @page
// margin boxes, one named page per document so the Exercise Plan can mix them.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sharedDir } from '../render/templates'
import { cssString } from './escape'

export const EXERCISE_MARKING = 'EXERCISE — FOR TRAINING USE'

export const DOC_LABELS = {
  msel: 'Master Scenario Events List',
  deck: 'Master Inject Deck',
  handbook: 'Controller / Evaluator Handbook',
  briefing: 'Player Briefing Packet',
  eeg: 'Exercise Evaluation Guides',
  explan: 'Exercise Plan (ExPlan)',
  sitman: 'Situation Manual',
  sitman_player: 'Situation Manual (Player Edition)',
  handbook_hseep: 'C/E Handbook (HSEEP)',
  aar: 'After-Action Report / Improvement Plan',
} as const
export type DocKey = keyof typeof DOC_LABELS

export interface RunningText {
  /** Left of the header: the scenario title. */
  title: string
  /** Left of the footer: organization · version · date. */
  footer: string
  /** Centre of header and footer; the exercise details' marking (#420), else EXERCISE_MARKING. */
  marking?: string
}

const BOX_FONT = `font-family: 'Inter', Arial, sans-serif; font-size: 7pt; color: #45494f; white-space: nowrap;`
const MARK_FONT = `font-family: 'Inter', Arial, sans-serif; font-size: 7pt; font-weight: 700; letter-spacing: 0.06em; color: #16181b; white-space: nowrap;`

function marginBoxes(text: RunningText, docLabel: string): string {
  const marking = text.marking || EXERCISE_MARKING
  return `
  @top-left { content: ${cssString(text.title)}; ${BOX_FONT} vertical-align: bottom; padding-bottom: 10pt; }
  @top-center { content: ${cssString(marking)}; ${MARK_FONT} vertical-align: bottom; padding-bottom: 10pt; }
  @top-right { content: ${cssString(docLabel)}; ${BOX_FONT} vertical-align: bottom; padding-bottom: 10pt; }
  @bottom-left { content: ${cssString(text.footer)}; ${BOX_FONT} vertical-align: top; padding-top: 10pt; }
  @bottom-center { content: ${cssString(marking)}; ${MARK_FONT} vertical-align: top; padding-top: 10pt; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); ${BOX_FONT} vertical-align: top; padding-top: 10pt; }`
}

const PORTRAIT_MARGIN = 'margin: 0.85in 0.75in 0.8in;'
const LANDSCAPE_MARGIN = 'margin: 0.8in 0.6in 0.75in;'
const NO_BOXES = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]
  .map((b) => `@${b} { content: none; }`)
  .join(' ')

/** @page rules for every named page, with this export's running text. */
export function pageCss(text: RunningText, defaultLabel: string): string {
  const named = (name: DocKey, size: string, margin: string) =>
    `@page ${name} { size: ${size}; ${margin} ${marginBoxes(text, DOC_LABELS[name])} }`
  return [
    `@page { size: letter; ${PORTRAIT_MARGIN} ${marginBoxes(text, defaultLabel)} }`,
    named('msel', 'letter landscape', LANDSCAPE_MARGIN),
    named('deck', 'letter', PORTRAIT_MARGIN),
    named('handbook', 'letter', PORTRAIT_MARGIN),
    named('briefing', 'letter', PORTRAIT_MARGIN),
    named('eeg', 'letter landscape', LANDSCAPE_MARGIN),
    named('explan', 'letter', PORTRAIT_MARGIN),
    named('sitman', 'letter', PORTRAIT_MARGIN),
    named('sitman_player', 'letter', PORTRAIT_MARGIN),
    named('handbook_hseep', 'letter', PORTRAIT_MARGIN),
    named('aar', 'letter', PORTRAIT_MARGIN),
    // Appendix A of the AAR/IP (#419): the eight-column Improvement Plan prints landscape.
    `@page aar-ip { size: letter landscape; ${LANDSCAPE_MARGIN} ${marginBoxes(text, DOC_LABELS.aar)} }`,
    `@page cover { size: letter; margin: 0.9in 0.85in 0.8in; ${NO_BOXES} @bottom-center { content: ${cssString(text.marking || EXERCISE_MARKING)}; ${MARK_FONT} } }`,
    `@page form { size: letter; margin: 0; ${NO_BOXES} }`,
  ].join('\n')
}

const FONT_FILES: [family: string, weight: number, file: string][] = [
  ['Inter', 400, 'inter-latin-400-normal.woff2'],
  ['Inter', 500, 'inter-latin-500-normal.woff2'],
  ['Inter', 600, 'inter-latin-600-normal.woff2'],
  ['Inter', 700, 'inter-latin-700-normal.woff2'],
  ['Source Serif 4', 400, 'source-serif-4-latin-400-normal.woff2'],
  ['Source Serif 4', 600, 'source-serif-4-latin-600-normal.woff2'],
  ['Source Serif 4', 700, 'source-serif-4-latin-700-normal.woff2'],
  ['JetBrains Mono', 400, 'jetbrains-mono-latin-400-normal.woff2'],
  ['JetBrains Mono', 700, 'jetbrains-mono-latin-700-normal.woff2'],
  ['Roboto', 400, 'roboto-latin-400-normal.woff2'],
  ['Roboto', 500, 'roboto-latin-500-normal.woff2'],
  ['Roboto', 700, 'roboto-latin-700-normal.woff2'],
]

let fontsCache: string | undefined

/**
 * The bundled fonts as data: URLs, so the same document renders in the PDF window and in
 * the app's sandboxed preview frame (which cannot read file: URLs). Roboto is for the
 * embedded ICS forms.
 */
export function embeddedFontsCss(): string {
  if (fontsCache) return fontsCache
  const dir = join(sharedDir(), 'fonts')
  fontsCache = FONT_FILES.map(([family, weight, file]) => {
    const data = readFileSync(join(dir, file)).toString('base64')
    return `@font-face { font-family: '${family}'; font-style: normal; font-weight: ${weight}; font-display: block; src: url(data:font/woff2;base64,${data}) format('woff2'); }`
  }).join('\n')
  return fontsCache
}
