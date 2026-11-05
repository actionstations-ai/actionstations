// lab_temperature_alarm_trend (spec 0466 FR-7): a freezer or incubator temperature against its
// set point, with the alarm threshold, the time the alarm sounded, the time it was acknowledged
// and the warming curve after the failure. It draws through the shared time series chart so the
// axes, legend and numbered notes match the other figures; the summary and table state the
// numbers. Viability limits are the designer's exercise parameters, never biology.
import { z } from 'zod'
import { timeSeriesKind } from '../time-series'
import type { FigureKind } from '../types'

export const TREND_EVENTS = [
  'alarm_sounded',
  'call_out',
  'acknowledged',
  'limit_reached',
  'restored',
] as const
const EVENT_LABEL: Record<(typeof TREND_EVENTS)[number], string> = {
  alarm_sounded: 'Alarm sounded',
  call_out: 'Call-out attempted',
  acknowledged: 'Alarm acknowledged',
  limit_reached: 'Designer limit reached',
  restored: 'Temperature restored',
}

export const LabTrendData = z.object({
  title: z.string().max(200).optional(),
  unit: z.string().min(1).max(80),
  /** Set point, alarm threshold and the designer's viability limit, in degrees C. */
  setPointC: z.number().finite(),
  alarmThresholdC: z.number().finite(),
  limitC: z.number().finite().optional(),
  points: z
    .array(z.object({ time: z.iso.datetime(), c: z.number().finite() }))
    .min(2)
    .max(2000),
  events: z
    .array(
      z.object({
        time: z.iso.datetime(),
        kind: z.enum(TREND_EVENTS),
        note: z.string().max(100).optional(),
      }),
    )
    .max(9)
    .default([]),
})
export type LabTrendData = z.infer<typeof LabTrendData>

const hhmm = (iso: string): string => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`

export const labTrendKind: FigureKind<LabTrendData> = {
  kind: 'lab_temperature_alarm_trend',
  schema: LabTrendData,
  defaultHeight: 380,
  render(d, o) {
    const out = timeSeriesKind.render(
      {
        title: d.title ?? `${d.unit} temperature`,
        yLabel: 'Temperature',
        unit: '°C',
        xLabel: 'Time (UTC)',
        series: [{ name: d.unit, points: d.points.map((p) => ({ x: p.time, y: p.c })) }],
        thresholds: [
          { value: d.alarmThresholdC, label: 'Alarm threshold' },
          ...(d.limitC !== undefined ? [{ value: d.limitC, label: 'Designer limit' }] : []),
        ],
        annotations: d.events.map((e) => ({
          x: e.time,
          label: `${EVENT_LABEL[e.kind]}${e.note ? `: ${e.note}` : ''}`,
        })),
      },
      o,
    )
    const peak = d.points.reduce((a, p) => (p.c > a.c ? p : a))
    const key = d.events
      .map((e) => `${EVENT_LABEL[e.kind].toLowerCase()} at ${hhmm(e.time)}`)
      .join(', ')
    const summary =
      `${d.unit}: set point ${d.setPointC} °C, alarm threshold ${d.alarmThresholdC} °C` +
      `${d.limitC !== undefined ? `, designer limit ${d.limitC} °C` : ''}. The temperature peaks at ${peak.c} °C at ${hhmm(peak.time)}.` +
      `${key ? ` ${key[0]!.toUpperCase()}${key.slice(1)}.` : ''} ` +
      out.summary
    return { ...out, summary }
  },
}
