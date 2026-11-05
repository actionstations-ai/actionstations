// Shared pieces of the space weather figure kinds (spec 0468 FR-5): the NOAA scale levels with
// their words and fill patterns (a level is never color alone), UTC time text, and small chart
// helpers. Everything is deterministic: fixed rounding and no locale-dependent formatting.
import { line } from 'd3-shape'
import { z } from 'zod'
import { gLevelForKp } from '../../../toolkits/space_weather/lint'
import type { XAxis } from '../axis'
import { n, text } from '../svg'
import { AXIS, GRID, MUTED, type SeriesStyle } from '../theme'

export const IsoTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'not a date-time')
export const Title = z.string().max(200).optional()

export type Scale = 'G' | 'S' | 'R'
export const LEVEL_WORDS = ['none', 'Minor', 'Moderate', 'Strong', 'Severe', 'Extreme'] as const
export const SCALE_NAMES: Record<Scale, string> = {
  G: 'Geomagnetic storm',
  S: 'Solar radiation storm',
  R: 'Radio blackout',
}

const LEVEL_STYLES: readonly SeriesStyle[] = [
  { color: '#6b7683', dash: undefined, marker: 'circle', pattern: 'solid' },
  { color: '#1b7a3a', dash: undefined, marker: 'circle', pattern: 'hatch' },
  { color: '#8a5a00', dash: undefined, marker: 'square', pattern: 'dots' },
  { color: '#b34700', dash: undefined, marker: 'triangle', pattern: 'cross' },
  { color: '#b3121b', dash: undefined, marker: 'diamond', pattern: 'bars' },
  { color: '#6d1f6b', dash: undefined, marker: 'cross', pattern: 'solid' },
]
export const levelStyle = (level: number): SeriesStyle =>
  LEVEL_STYLES[Math.max(0, Math.min(5, level))]!

/** "G3 (Strong)" or "below G1" for a scale and level. */
export const levelText = (scale: Scale, level: number): string =>
  level > 0 ? `${scale}${level} (${LEVEL_WORDS[level]})` : `below ${scale}1`

/** A Kp value in thirds written as NOAA does: 7-, 7, 7+. */
export function kpLabel(kp: number): string {
  const whole = Math.round(kp)
  if (kp < whole - 0.1) return `${whole}-`
  if (kp > whole + 0.1) return `${whole}+`
  return String(whole)
}

/** The G level of a Kp value (thirds allowed): 9- counts as G4, 9 as G5, below 5 as none. */
export function gLevelOfKp(kp: number): number {
  const whole = Math.round(kp)
  return gLevelForKp(whole, kp < whole - 0.1 ? '-' : kp > whole + 0.1 ? '+' : '')
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (v: number): string => String(v).padStart(2, '0')

/** "Nov 06 12:00 UTC" for an ISO time. */
export function utcShort(iso: string): string {
  const d = new Date(Date.parse(iso))
  return `${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

/** Keep at most `max` rows of a list, always including the first and last. */
export function thin<T>(rows: readonly T[], max: number): T[] {
  if (rows.length <= max) return [...rows]
  const out: T[] = []
  for (let i = 0; i < max; i++) out.push(rows[Math.round((i * (rows.length - 1)) / (max - 1))]!)
  return out
}

/** Power-of-ten text for a log axis: 1e-6, 1e3. */
export const tenPower = (exp: number): string =>
  exp >= 0 && exp < 4 ? String(10 ** exp) : `1e${exp}`

/** The GOES X-ray class text for a flux in W/m2: A, B, C, M or X with one decimal. */
export function flareClass(flux: number): string {
  const classes: [string, number][] = [
    ['X', 1e-4],
    ['M', 1e-5],
    ['C', 1e-6],
    ['B', 1e-7],
    ['A', 1e-8],
  ]
  for (const [letter, base] of classes) {
    if (flux >= base) return `${letter}${(Math.floor((flux / base) * 10 + 1e-9) / 10).toFixed(1)}`
  }
  return `A${(Math.max(flux, 0) / 1e-8).toFixed(1)}`
}

export const STATE_TEXT = { time: 'Time (UTC)' }

/** The horizontal time axis along the bottom of a plot, with its label. */
export function bottomAxis(x: XAxis, left: number, right: number, plotB: number): string {
  let out = `<line x1="${left}" x2="${n(right)}" y1="${n(plotB)}" y2="${n(plotB)}" stroke="${AXIS}" stroke-width="1.5"/>`
  for (const tk of x.ticks) {
    out += `<line x1="${n(tk.pos)}" x2="${n(tk.pos)}" y1="${n(plotB)}" y2="${n(plotB + 5)}" stroke="${AXIS}"/>`
    out += text(tk.pos, plotB + 18, tk.label, { size: 11, anchor: 'middle', fill: MUTED })
  }
  out += text((left + right) / 2, plotB + 38, STATE_TEXT.time, {
    size: 12,
    anchor: 'middle',
    fill: MUTED,
  })
  return out
}

/** Horizontal grid lines with labels on the left axis. */
export function leftTicks(
  ticks: { y: number; label: string }[],
  left: number,
  right: number,
): string {
  return ticks
    .map(
      (t) =>
        `<line x1="${left}" x2="${n(right)}" y1="${n(t.y)}" y2="${n(t.y)}" stroke="${GRID}"/>` +
        text(left - 8, t.y + 4, t.label, { size: 11, anchor: 'end', fill: MUTED }),
    )
    .join('')
}

/** A polyline path through points already in pixels. */
export const pathOf = (pts: [number, number][]): string => line()(pts) ?? ''

export const hashKey = (d: unknown): string => JSON.stringify(d)

/** A "Simulated illustration" stamp for figures drawn from generated data. */
export const simulatedStamp = (x: number, y: number): string =>
  text(x, y, 'Simulated illustration, not an NOAA product', {
    size: 11,
    anchor: 'end',
    fill: MUTED,
    weight: 600,
  })
