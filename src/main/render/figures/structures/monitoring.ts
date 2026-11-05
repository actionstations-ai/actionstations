// structures_monitoring: one structural monitoring sensor (crack width, tilt, settlement, shoring
// load, strain or vibration) over time with the alarm and action levels and annotations (spec
// 0471 FR-5). It draws through the generic time_series kind so axes, thresholds and the data
// table behave the same, and states both levels, the unit and the first crossing in the summary.
// Values are magnitudes: a series that falls (settlement) is given as the amount of movement.
import { z } from 'zod'
import { xLabel, XValue } from '../axis'
import { esc, fmt } from '../svg'
import { timeSeriesKind } from '../time-series'
import type { FigureKind } from '../types'

export const SENSOR_TYPES = [
  'crack_width',
  'tilt',
  'settlement',
  'shoring_load',
  'strain',
  'vibration',
] as const
const SENSOR_LABEL: Record<(typeof SENSOR_TYPES)[number], string> = {
  crack_width: 'crack gauge',
  tilt: 'tiltmeter',
  settlement: 'settlement point',
  shoring_load: 'shoring load cell',
  strain: 'strain gauge',
  vibration: 'vibration monitor',
}

const Point = z.object({ x: XValue, y: z.number().finite() })

export const StructuresMonitoringData = z
  .object({
    title: z.string().max(200).optional(),
    sensor: z.object({
      id: z.string().min(1).max(40),
      type: z.enum(SENSOR_TYPES),
      unit: z.string().min(1).max(20),
      location: z.string().max(120).optional(),
    }),
    points: z.array(Point).min(2).max(2000),
    /** Investigate: the reading is moving toward trouble. */
    alarmLevel: z.number().finite().optional(),
    /** Stop work and clear the area. */
    actionLevel: z.number().finite().optional(),
    annotations: z
      .array(z.object({ x: XValue, label: z.string().min(1).max(160) }))
      .max(9)
      .default([]),
  })
  .refine((d) => d.alarmLevel !== undefined || d.actionLevel !== undefined, {
    message: 'give an alarm level, an action level or both',
  })
  .refine(
    (d) =>
      d.alarmLevel === undefined || d.actionLevel === undefined || d.actionLevel >= d.alarmLevel,
    { message: 'the action level may not be below the alarm level' },
  )
  .refine(
    (d) =>
      [...d.points.map((p) => p.x), ...d.annotations.map((a) => a.x)].every(
        (x) => typeof x === typeof d.points[0]!.x,
      ),
    { message: 'x values must be all numbers or all date-time strings' },
  )
export type StructuresMonitoringData = z.infer<typeof StructuresMonitoringData>

const at = (x: XValue): number => (typeof x === 'number' ? x : Date.parse(x))

function firstCrossing(d: StructuresMonitoringData, level: number): XValue | undefined {
  return [...d.points].sort((a, b) => at(a.x) - at(b.x)).find((p) => p.y >= level)?.x
}

export const structuresMonitoringKind: FigureKind<StructuresMonitoringData> = {
  kind: 'structures_monitoring',
  schema: StructuresMonitoringData,
  render(d, o) {
    const s = d.sensor
    const name = `${SENSOR_LABEL[s.type]} ${s.id}`
    const thresholds = [
      ...(d.alarmLevel !== undefined ? [{ value: d.alarmLevel, label: 'Alarm level' }] : []),
      ...(d.actionLevel !== undefined ? [{ value: d.actionLevel, label: 'Action level' }] : []),
    ]
    const base = timeSeriesKind.render(
      {
        title: d.title,
        yLabel: SENSOR_LABEL[s.type],
        unit: s.unit,
        series: [{ name, points: d.points }],
        thresholds,
        annotations: d.annotations,
      },
      o,
    )
    const levels = [
      d.alarmLevel !== undefined ? `alarm level ${fmt(d.alarmLevel)} ${s.unit}` : '',
      d.actionLevel !== undefined ? `action level ${fmt(d.actionLevel)} ${s.unit}` : '',
    ]
      .filter(Boolean)
      .join(' and ')
    const crossings = [
      d.alarmLevel !== undefined ? ['alarm', firstCrossing(d, d.alarmLevel)] : undefined,
      d.actionLevel !== undefined ? ['action', firstCrossing(d, d.actionLevel)] : undefined,
    ].flatMap((c) =>
      c
        ? [
            c[1] === undefined
              ? `The reading has not reached the ${c[0]} level.`
              : `The reading first reached the ${c[0]} level at ${xLabel(c[1] as XValue)}.`,
          ]
        : [],
    )
    const where = s.location ? ` at ${s.location}` : ''
    const summary =
      `Monitoring: ${name}${where}, ${levels}; values are magnitudes in ${s.unit}. ` +
      `${crossings.join(' ')} ${base.summary}`
    return {
      svg: base.svg.replace(
        /<desc id="([^"]+)">[^<]*<\/desc>/,
        `<desc id="$1">${esc(summary)}</desc>`,
      ),
      summary,
      table: base.table,
    }
  },
}
