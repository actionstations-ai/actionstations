// Small SVG string helpers shared by the figure kinds. Output is deterministic (fixed rounding,
// no random ids) so renders and goldens are reproducible.
import { INK, FONT, MUTED, SURFACE, type SeriesStyle } from './theme'

export const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Number for an attribute: at most 2 decimals, no "-0". */
export const n = (v: number): string => {
  const r = Math.round(v * 100) / 100
  return String(Object.is(r, -0) ? 0 : r)
}

/** Stable short id from text, for pattern ids that must not collide between figures. */
export function hashId(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export interface TextOpts {
  size?: number
  weight?: number
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
  baseline?: 'auto' | 'middle' | 'hanging'
  extra?: string
}

export function text(x: number, y: number, s: string, o: TextOpts = {}): string {
  const attrs = [
    `x="${n(x)}"`,
    `y="${n(y)}"`,
    `font-size="${o.size ?? 12}"`,
    o.weight ? `font-weight="${o.weight}"` : '',
    `fill="${o.fill ?? INK}"`,
    o.anchor ? `text-anchor="${o.anchor}"` : '',
    o.baseline ? `dominant-baseline="${o.baseline}"` : '',
    o.extra ?? '',
  ]
    .filter(Boolean)
    .join(' ')
  return `<text ${attrs}>${esc(s)}</text>`
}

/** Greedy word wrap by character count (the font is proportional; this is a close estimate). */
export function wrap(s: string, maxChars: number, maxLines = 3): string[] {
  const words = String(s).split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > maxChars) {
      lines.push(cur)
      cur = w
    } else cur = cur ? cur + ' ' + w : w
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = kept[maxLines - 1]!.replace(/.{0,2}$/, '') + '…'
    return kept
  }
  return lines
}

/** Approximate rendered width of a label at a font size (Inter averages about 0.56 em). */
export const textWidth = (s: string, size: number): number => s.length * size * 0.56

export interface FrameOpts {
  width: number
  height: number
  title: string
  summary: string
  defs?: string
  body: string
  idKey: string
}

/** The outer SVG: role img, an accessible name and description, white background. */
export function frame(o: FrameOpts): string {
  const id = hashId(o.idKey)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="ft-${id} fd-${id}" ` +
    `viewBox="0 0 ${n(o.width)} ${n(o.height)}" width="${n(o.width)}" height="${n(o.height)}" ` +
    `font-family="${esc(FONT)}">` +
    `<title id="ft-${id}">${esc(o.title)}</title><desc id="fd-${id}">${esc(o.summary)}</desc>` +
    (o.defs ? `<defs>${o.defs}</defs>` : '') +
    `<rect width="${n(o.width)}" height="${n(o.height)}" fill="${SURFACE}"/>` +
    o.body +
    `</svg>`
  )
}

export const heading = (title: string | undefined, x: number): string =>
  title ? text(x, 20, title, { size: 15, weight: 700 }) : ''

/** A marker shape centred on (x, y). */
export function marker(shape: SeriesStyle['marker'], x: number, y: number, color: string): string {
  const r = 4
  const base = `fill="${color}" stroke="${SURFACE}" stroke-width="1"`
  switch (shape) {
    case 'square':
      return `<rect x="${n(x - r)}" y="${n(y - r)}" width="${2 * r}" height="${2 * r}" ${base}/>`
    case 'triangle':
      return `<path d="M${n(x)} ${n(y - r - 1)}L${n(x + r + 1)} ${n(y + r)}L${n(x - r - 1)} ${n(y + r)}Z" ${base}/>`
    case 'diamond':
      return `<path d="M${n(x)} ${n(y - r - 1)}L${n(x + r + 1)} ${n(y)}L${n(x)} ${n(y + r + 1)}L${n(x - r - 1)} ${n(y)}Z" ${base}/>`
    case 'cross':
      return `<path d="M${n(x - r)} ${n(y - r)}L${n(x + r)} ${n(y + r)}M${n(x + r)} ${n(y - r)}L${n(x - r)} ${n(y + r)}" stroke="${color}" stroke-width="2.4" fill="none"/>`
    default:
      return `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" ${base}/>`
  }
}

/** Pattern definition for a fill: the series color with a white overlay texture. */
export function patternDef(id: string, style: SeriesStyle): string {
  const c = style.color
  const bg = `<rect width="8" height="8" fill="${c}"/>`
  const w = '#ffffff'
  const body: Record<SeriesStyle['pattern'], string> = {
    solid: bg,
    hatch: `${bg}<path d="M-1 1L1 -1M0 8L8 0M7 9L9 7" stroke="${w}" stroke-width="1.6"/>`,
    dots: `${bg}<circle cx="2" cy="2" r="1.2" fill="${w}"/><circle cx="6" cy="6" r="1.2" fill="${w}"/>`,
    cross: `${bg}<path d="M0 0L8 8M8 0L0 8" stroke="${w}" stroke-width="1.2"/>`,
    bars: `${bg}<path d="M0 2H8M0 6H8" stroke="${w}" stroke-width="1.4"/>`,
  }
  return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse">${body[style.pattern]}</pattern>`
}

/** A legend laid out left to right, wrapping when a row would overflow `maxX`. */
export function legend(
  items: { name: string; swatch: (x: number, y: number) => string }[],
  x0: number,
  y0: number,
  maxX: number,
): { svg: string; height: number } {
  let x = x0
  let y = y0
  let out = ''
  for (const it of items) {
    const w = 34 + textWidth(it.name, 12) + 14
    if (x + w > maxX && x > x0) {
      x = x0
      y += 20
    }
    out += it.swatch(x, y) + text(x + 32, y + 4, it.name, { size: 12, fill: MUTED })
    x += w
  }
  return { svg: out, height: y - y0 + 20 }
}

/** A number in plain text with grouping, trimmed to sensible precision. */
export function fmt(v: number): string {
  if (!Number.isFinite(v)) return String(v)
  const abs = Math.abs(v)
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(v)
}
