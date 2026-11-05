// logistics_temperature_chart (spec 0462 FR-5): a data logger or cold room record drawn as a time
// series with the allowed range as two limit lines, and the time out of range stated in text.
// The first excursion and the return to range are annotated, so no label sits on the data.
import { z } from 'zod'
import { excursionSummary } from '@shared/logistics/arithmetic'
import { timeSeriesKind } from '../time-series'
import type { FigureKind, FigureOptions, FigureResult } from '../types'

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'not a date or time')

export const TemperatureChartData = z
  .object({
    title: z.string().max(200).optional(),
    unit: z.enum(['°C', '°F']).default('°C'),
    low: z.number().finite(),
    high: z.number().finite(),
    location: z.string().max(80).optional(),
    readings: z
      .array(z.object({ t: isoDate, v: z.number().finite() }))
      .min(2)
      .max(300),
    simulated: z.boolean().default(true),
  })
  .refine((d) => d.low < d.high, { message: 'the lower limit must be below the upper limit' })
export type TemperatureChartData = z.infer<typeof TemperatureChartData>

const stamp = (ms: number): string => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
const one = (v: number): string => (Math.round(v * 10) / 10).toFixed(1)

function render(d: TemperatureChartData, o: FigureOptions): FigureResult {
  const title = d.title ?? `Temperature record${d.location ? `: ${d.location}` : ''}`
  const readings = d.readings
    .map((r) => ({ tMs: Date.parse(r.t), value: r.v }))
    .sort((a, b) => a.tMs - b.tMs)
  const ex = excursionSummary(readings, d.low, d.high)
  const annotations = [
    ...(ex.firstOutsideMs === null
      ? []
      : [{ x: new Date(ex.firstOutsideMs).toISOString(), label: 'Left the allowed range' }]),
    ...(ex.returnedMs === null
      ? []
      : [{ x: new Date(ex.returnedMs).toISOString(), label: 'Back in range' }]),
  ]
  const chart = timeSeriesKind.render(
    timeSeriesKind.schema.parse({
      title,
      yLabel: 'Temperature',
      unit: d.unit,
      series: [
        {
          name: 'Reading',
          points: readings.map((r) => ({ x: new Date(r.tMs).toISOString(), y: r.value })),
        },
      ],
      thresholds: [
        { value: d.low, label: 'Lower limit' },
        { value: d.high, label: 'Upper limit' },
      ],
      annotations,
    }),
    o,
  )
  const note = d.simulated ? ' Simulated readings.' : ''
  const state =
    ex.firstOutsideMs === null
      ? 'The record stays inside the allowed range.'
      : `The temperature left the range at ${stamp(ex.firstOutsideMs)} UTC, peaked at ${one(ex.peak)} ${d.unit}, ` +
        `and was outside it for ${ex.minutesOutside} minutes; ` +
        (ex.returnedMs === null
          ? 'it is still outside.'
          : `it returned at ${stamp(ex.returnedMs)} UTC.`)
  const summary = `${title}: ${readings.length} readings against an allowed range of ${d.low} to ${d.high} ${d.unit}. ${state}${note}`
  return {
    svg: chart.svg,
    summary,
    table: {
      caption: title,
      columns: ['Time (UTC)', `Reading (${d.unit})`, 'In range'],
      rows: readings.map((r) => [
        stamp(r.tMs),
        one(r.value),
        r.value < d.low || r.value > d.high ? 'NO' : 'yes',
      ]),
    },
  }
}

export const logisticsTemperatureChartKind: FigureKind<TemperatureChartData> = {
  kind: 'logistics_temperature_chart',
  schema: TemperatureChartData,
  render,
}
