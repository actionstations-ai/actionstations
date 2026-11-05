// Shared pieces of the flood figure kinds (spec 0454 FR-5): the point's own category table,
// the category cues (a word, a fill pattern and a color, never color alone) and small helpers.
import { z } from 'zod'
import { categoryAtStage, type FloodCategory } from '../../../toolkits/flooding/lint'
import { hashId, patternDef } from '../svg'
import type { SeriesStyle } from '../theme'

const Stage = z.number().finite()

/**
 * The stages at which a forecast point's categories begin, in the unit of the figure. Any may be
 * missing: minor, moderate and major categories do not exist at every point (NWS Manual 10-950).
 */
export const CategoryTableSchema = z
  .object({
    action: Stage.optional(),
    flood: Stage.optional(),
    minor: Stage.optional(),
    moderate: Stage.optional(),
    major: Stage.optional(),
  })
  .refine(
    (t) => {
      const defined = [t.action, t.flood, t.minor, t.moderate, t.major].filter(
        (v): v is number => v !== undefined,
      )
      return defined.every((v, i) => i === 0 || v >= defined[i - 1]!)
    },
    { message: 'stages must rise: action, flood, minor, moderate, major' },
  )
export type CategoryTableData = z.infer<typeof CategoryTableSchema>

export const GaugeSchema = z.object({
  name: z.string().min(1).max(120),
  /** NWS location id or USGS site number, as printed. */
  id: z.string().max(40).optional(),
  /** What the zero of the stage is, e.g. "NAVD88" or "gauge datum". */
  datum: z.string().max(60).optional(),
  timeZone: z.string().max(60).optional(),
  unit: z.enum(['ft', 'cfs', 'kcfs']).default('ft'),
})
export type GaugeData = z.infer<typeof GaugeSchema>

export const IsoTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'not a date-time')
export const TimedValue = z.object({ time: IsoTime, value: z.number().finite() })
export type TimedValue = z.infer<typeof TimedValue>

export const CATEGORY_WORD: Record<FloodCategory, string> = {
  none: 'Below flood categories',
  action: 'Action',
  minor: 'Minor flooding',
  moderate: 'Moderate flooding',
  major: 'Major flooding',
}

export const CATEGORY_STYLE: Record<Exclude<FloodCategory, 'none'>, SeriesStyle> = {
  action: { color: '#1f5fbf', dash: undefined, marker: 'circle', pattern: 'bars' },
  minor: { color: '#8a5a00', dash: undefined, marker: 'triangle', pattern: 'hatch' },
  moderate: { color: '#b3121b', dash: undefined, marker: 'square', pattern: 'dots' },
  major: { color: '#6d3fb5', dash: undefined, marker: 'diamond', pattern: 'cross' },
}

export const categoryOf = (table: CategoryTableData, value: number): FloodCategory =>
  categoryAtStage(table, value)

/** "14.6 ft" / "12,400 cfs" / "12.4 kcfs": the value with its unit. */
export function withUnit(value: number, unit: GaugeData['unit']): string {
  const digits = unit === 'ft' ? 1 : unit === 'kcfs' ? 1 : 0
  const s = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
  return `${s} ${unit}`
}

const pad = (v: number): string => String(v).padStart(2, '0')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * A time as local text in the gauge's time zone ("Mon Nov 9 12:00 CST"); UTC when no zone is
 * given. Intl with a fixed locale keeps the output the same on every machine.
 */
export function localTime(iso: string, timeZone?: string): string {
  const d = new Date(Date.parse(iso))
  if (!timeZone) {
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
  }
  try {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    })
    const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]))
    const hour = p.hour === '24' ? '00' : p.hour
    return `${p.weekday} ${p.month} ${p.day} ${hour}:${p.minute} ${p.timeZoneName}`
  } catch {
    return localTime(iso)
  }
}

/** Pattern ids and definitions for the four category fills of one figure. */
export function categoryPatterns(idKey: string): { defs: string; id: (c: string) => string } {
  const id = (c: string): string => `cat-${idKey}-${c}`
  const defs = (Object.keys(CATEGORY_STYLE) as (keyof typeof CATEGORY_STYLE)[])
    .map((c) => patternDef(id(c), CATEGORY_STYLE[c]))
    .join('')
  return { defs, id }
}

/** Keep at most `max` rows of a list, always including the first and last. */
export function thin<T>(rows: readonly T[], max: number): T[] {
  if (rows.length <= max) return [...rows]
  const out: T[] = []
  for (let i = 0; i < max; i++) out.push(rows[Math.round((i * (rows.length - 1)) / (max - 1))]!)
  return out
}

/** Stable key of a figure's data, for the SVG's element ids. */
export const hashKey = (d: unknown): string => JSON.stringify(d)

/** Short id of a figure's data, for pattern ids. */
export const shortId = (d: unknown): string => hashId(JSON.stringify(d))
