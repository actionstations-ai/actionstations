// Early warning score configuration and arithmetic (spec 0452 FR-5, FR-6). The score is data:
// parameters with bands (a range of values and the points it earns), trigger levels with a
// recommended response, and a source line. A neutral default ships with the app; a named
// published score is added only after its terms are confirmed, with its source cited on the
// chart. The bands of the default are this app's own and are exercise content, not clinical
// guidance. Pure; zod so a score can be carried in pack data or in an inject.
import { z } from 'zod'

const Short = z.string().min(1).max(120)

export const EwsBand = z
  .object({
    /** Inclusive lower bound; absent means no lower bound. */
    from: z.number().finite().optional(),
    /** Inclusive upper bound; absent means no upper bound. */
    to: z.number().finite().optional(),
    points: z.number().int().min(0).max(10),
    /** The text of the band ("12 to 20"), printed on the chart. */
    label: Short.optional(),
  })
  .refine((b) => b.from === undefined || b.to === undefined || b.from <= b.to, {
    message: 'a band needs from <= to',
  })
export type EwsBand = z.infer<typeof EwsBand>

export const EwsParameter = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/),
  label: Short,
  unit: z.string().max(20).default(''),
  /** Numeric parameters use bands; categorical ones (alertness) use `categories`. */
  bands: z.array(EwsBand).max(12).default([]),
  categories: z
    .array(z.object({ value: Short, points: z.number().int().min(0).max(10) }))
    .max(12)
    .default([]),
})
export type EwsParameter = z.infer<typeof EwsParameter>

export const EwsTrigger = z.object({
  /** The lowest total that reaches this level. */
  minTotal: z.number().int().min(0),
  /** The level named in words so color is never the only cue. */
  level: Short,
  response: z.string().min(1).max(300),
})
export type EwsTrigger = z.infer<typeof EwsTrigger>

export const EwsConfig = z.object({
  name: Short,
  /** Where the score comes from; required so a chart always cites it. */
  source: z.string().min(1).max(300),
  parameters: z.array(EwsParameter).min(1).max(12),
  /** A single parameter at this many points triggers at least `singleTrigger`'s response. */
  singleParameterMax: z.number().int().min(1).max(10).optional(),
  triggers: z.array(EwsTrigger).min(1).max(8),
})
export type EwsConfig = z.infer<typeof EwsConfig>

/** The neutral score bundled with the app. Not a published score. */
export const NEUTRAL_EWS: EwsConfig = EwsConfig.parse({
  name: 'Exercise early warning score (neutral)',
  source:
    'Neutral configurable score of this app for exercises; not a published or validated score',
  singleParameterMax: 3,
  parameters: [
    {
      key: 'respiratory_rate',
      label: 'Respiratory rate',
      unit: '/min',
      bands: [
        { to: 8, points: 3, label: '8 or less' },
        { from: 9, to: 11, points: 1, label: '9 to 11' },
        { from: 12, to: 20, points: 0, label: '12 to 20' },
        { from: 21, to: 24, points: 2, label: '21 to 24' },
        { from: 25, points: 3, label: '25 or more' },
      ],
    },
    {
      key: 'oxygen_saturation',
      label: 'Oxygen saturation',
      unit: '%',
      bands: [
        { to: 91, points: 3, label: '91 or less' },
        { from: 92, to: 93, points: 2, label: '92 to 93' },
        { from: 94, to: 95, points: 1, label: '94 to 95' },
        { from: 96, points: 0, label: '96 or more' },
      ],
    },
    {
      key: 'systolic_bp',
      label: 'Systolic blood pressure',
      unit: 'mmHg',
      bands: [
        { to: 90, points: 3, label: '90 or less' },
        { from: 91, to: 100, points: 2, label: '91 to 100' },
        { from: 101, to: 110, points: 1, label: '101 to 110' },
        { from: 111, to: 219, points: 0, label: '111 to 219' },
        { from: 220, points: 3, label: '220 or more' },
      ],
    },
    {
      key: 'heart_rate',
      label: 'Heart rate',
      unit: '/min',
      bands: [
        { to: 40, points: 3, label: '40 or less' },
        { from: 41, to: 50, points: 1, label: '41 to 50' },
        { from: 51, to: 90, points: 0, label: '51 to 90' },
        { from: 91, to: 110, points: 1, label: '91 to 110' },
        { from: 111, to: 130, points: 2, label: '111 to 130' },
        { from: 131, points: 3, label: '131 or more' },
      ],
    },
    {
      key: 'temperature',
      label: 'Temperature',
      unit: 'C',
      bands: [
        { to: 35, points: 3, label: '35.0 or less' },
        { from: 35.1, to: 36, points: 1, label: '35.1 to 36.0' },
        { from: 36.1, to: 38, points: 0, label: '36.1 to 38.0' },
        { from: 38.1, to: 39, points: 1, label: '38.1 to 39.0' },
        { from: 39.1, points: 2, label: '39.1 or more' },
      ],
    },
    {
      key: 'consciousness',
      label: 'Level of consciousness',
      categories: [
        { value: 'Alert', points: 0 },
        { value: 'New confusion', points: 3 },
        { value: 'Responds to voice', points: 3 },
        { value: 'Responds to pain', points: 3 },
        { value: 'Unresponsive', points: 3 },
      ],
    },
  ],
  triggers: [
    { minTotal: 0, level: 'Routine', response: 'Continue routine monitoring.' },
    { minTotal: 3, level: 'Low', response: 'Nurse reassesses and increases monitoring.' },
    { minTotal: 5, level: 'Medium', response: 'Urgent review by the covering provider.' },
    { minTotal: 7, level: 'High', response: 'Call the rapid response team.' },
  ],
})

export type EwsReading = Record<string, number | string | null | undefined>

export interface EwsLine {
  key: string
  label: string
  unit: string
  value: string
  band: string
  points: number
}

export interface EwsResult {
  lines: EwsLine[]
  total: number
  trigger: EwsTrigger
  /** A single parameter at the single-parameter maximum raises the level to at least the first
   * level that needs a response above routine monitoring. */
  singleParameter: boolean
  /** Parameters with no value in the reading; they score nothing and the total says so. */
  missing: string[]
}

const inBand = (v: number, b: EwsBand): boolean =>
  (b.from === undefined || v >= b.from) && (b.to === undefined || v <= b.to)

/** Points for one parameter reading; undefined when the value is missing or matches no band. */
export function scoreParameter(
  p: EwsParameter,
  raw: number | string | null | undefined,
): { points: number; band: string; value: string } | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined
  if (p.categories.length) {
    const c = p.categories.find((x) => x.value.toLowerCase() === String(raw).toLowerCase())
    return c ? { points: c.points, band: c.value, value: String(raw) } : undefined
  }
  const v = Number(raw)
  if (!Number.isFinite(v)) return undefined
  const b = p.bands.find((x) => inBand(v, x))
  return b ? { points: b.points, band: b.label ?? String(v), value: String(raw) } : undefined
}

/** The trigger level for a total: the highest level whose minimum the total reaches. */
export function triggerFor(config: EwsConfig, total: number): EwsTrigger {
  const sorted = [...config.triggers].sort((a, b) => a.minTotal - b.minTotal)
  let hit = sorted[0]!
  for (const t of sorted) if (total >= t.minTotal) hit = t
  return hit
}

/** The score of a reading under a configuration. */
export function computeEws(config: EwsConfig, reading: EwsReading): EwsResult {
  const lines: EwsLine[] = []
  const missing: string[] = []
  for (const p of config.parameters) {
    const s = scoreParameter(p, reading[p.key])
    if (!s) {
      missing.push(p.label)
      continue
    }
    lines.push({
      key: p.key,
      label: p.label,
      unit: p.unit,
      value: s.value,
      band: s.band,
      points: s.points,
    })
  }
  const total = lines.reduce((n, l) => n + l.points, 0)
  let trigger = triggerFor(config, total)
  const single =
    config.singleParameterMax !== undefined &&
    lines.some((l) => l.points >= config.singleParameterMax!)
  if (single) {
    const floor = [...config.triggers].sort((a, b) => a.minTotal - b.minTotal)[1]
    if (floor && trigger.minTotal < floor.minTotal) trigger = floor
  }
  return { lines, total, trigger, singleParameter: single, missing }
}
