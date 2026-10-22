// Blank ICS forms for the Player Briefing Packet, rendered from the inject templates
// (templates/injects/ics_201_prefill, ics_203_prefill) with variant 'blank'. The template
// body is embedded in the packet as real HTML (vector text, tagged) with its CSS scoped to a
// wrapper so its generic class names (.page, .form, b…) cannot leak into the document.
import { composeDocument } from '../render/compose'
import { loadTemplate } from '../render/templates'

export const BLANK_FORMS = [
  { type: 'ics_201_prefill', label: 'ICS 201 Incident Briefing (blank form)' },
  { type: 'ics_203_prefill', label: 'ICS 203 Organization Assignment List (blank form)' },
] as const
export type BlankFormType = (typeof BLANK_FORMS)[number]['type']

const ROOT_SELECTOR = /^(html|body|:root)(?![\w-])/

function scopeSelector(selector: string, scope: string): string {
  const s = selector.trim()
  if (!s) return s
  if (ROOT_SELECTOR.test(s)) return s.replace(ROOT_SELECTOR, scope)
  return `${scope} ${s}`
}

/** Index of the brace that closes the block opened at `open`. */
function matchingBrace(css: string, open: number): number {
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return i
  }
  return css.length - 1
}

/**
 * Prefix every style rule in `css` with `scope` (html/body/:root map onto the scope itself).
 * Rules inside @media/@supports are scoped recursively; @page and @font-face are dropped
 * (the document owns pages and fonts). For trusted template CSS, not arbitrary input.
 */
export function scopeCss(css: string, scope: string): string {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  let out = ''
  let i = 0
  while (i < src.length) {
    const open = src.indexOf('{', i)
    if (open < 0) break
    const prelude = src.slice(i, open).trim()
    const close = matchingBrace(src, open)
    const inner = src.slice(open + 1, close)
    if (/^@(media|supports|container)\b/.test(prelude)) {
      out += `${prelude} {\n${scopeCss(inner, scope)}}\n`
    } else if (!prelude.startsWith('@')) {
      const selectors = prelude.split(',').map((sel) => scopeSelector(sel, scope))
      out += `${selectors.join(', ')} {${inner}}\n`
    }
    i = close + 1
  }
  return out
}

export interface EmbeddedForm {
  label: string
  /** Scoped markup: the template body inside `<div class="<scope> variant-blank">`. */
  html: string
  css: string
}

/** Compose a blank form and return its body markup and scoped CSS. */
export function embedBlankForm(type: BlankFormType, label: string): EmbeddedForm {
  const scope = `ttx-form-${type.replace(/_/g, '-')}`
  const doc = composeDocument({ type, fields: {}, variant: 'blank' })
  const main = /<main class="inject-root[\s\S]*<\/main>/.exec(doc.html)?.[0] ?? ''
  return {
    label,
    html: `<div class="${scope} variant-blank">${main}</div>`,
    css: scopeCss(loadTemplate(type).css, `.${scope}`),
  }
}

/** Standalone blank form document for its own PDF (players/ folder). */
export function blankFormDocument(type: BlankFormType) {
  return composeDocument({ type, fields: {}, variant: 'blank' })
}
