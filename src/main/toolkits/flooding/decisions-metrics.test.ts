// The flooding toolkit's decision forms and metric configurations (spec 0454 FR-12..FR-14), run
// on a worked closure example: each configuration is a valid input to the real metric.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ToolkitSchema } from '@shared/toolkits'
import type { MetricDecision } from '@shared/schemas/metrics'
import { runMetric } from '../../evaluation/metrics/registry'
import { zoneSeries } from './threshold-series'

const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/flooding.json'), 'utf8')),
)
const metric = (label: RegExp) => toolkit.metrics.find((m) => label.test(m.label ?? ''))!

// Stage at the gauge, hourly, rising through the morning.
const stage = Array.from({ length: 12 }, (_, i) => ({
  t: `2026-11-07T${String(6 + i).padStart(2, '0')}:00:00Z`,
  v: 11 + i * 0.5,
}))
const zones = [
  { name: 'Mill Road crossing', floodsAtStage: 14 },
  { name: 'River Road mile 4', floodsAtStage: 15.5 },
]
const decision = (area: string, time: string, kind = 'close_road'): MetricDecision => ({
  id: `${kind}-${area}`,
  time,
  kind,
  area,
  fields: {},
})

describe('decision forms', () => {
  it('has the decisions of the spec, each with a time and a basis', () => {
    expect(toolkit.decisionForms.map((f) => f.id)).toEqual([
      'activate_eoc',
      'order_evacuation',
      'close_road',
      'open_shelter',
      'order_resources',
      'move_assets',
      'request_help',
      'public_message',
    ])
    for (const f of toolkit.decisionForms) {
      const ids = f.fields.map((x) => x.id)
      expect(ids, f.id).toEqual(expect.arrayContaining(['time', 'basis']))
    }
  })
  it('asks for an area where the decision is about a place', () => {
    const area = (id: string) =>
      toolkit.decisionForms.find((f) => f.id === id)!.fields.some((x) => x.kind === 'area')
    expect(area('order_evacuation')).toBe(true)
    expect(area('close_road')).toBe(true)
  })
})

describe('threshold timing on a worked closure example', () => {
  const closure = metric(/Road and crossing closure/)
  const series = zoneSeries(stage, zones)
  it('scores a closure before the road floods as on time and one after as late', () => {
    // Mill Road floods when the stage reaches 14 ft (12:00Z); River Road at 15.5 ft (15:00Z).
    const r = runMetric(
      { id: 'threshold_timing', config: closure.config },
      {
        series,
        decisions: [
          decision('Mill Road crossing', '2026-11-07T10:00:00Z'),
          decision('River Road mile 4', '2026-11-07T16:00:00Z'),
        ],
      },
    )
    const z = (r.data as { zones: Record<string, { status: string; marginMin: number }> }).zones
    expect(z['Mill Road crossing']).toMatchObject({ status: 'on_time', marginMin: 120 })
    expect(z['River Road mile 4']).toMatchObject({ status: 'late', marginMin: -60 })
  })
  it('subtracts the clearance time for evacuation and reports no action plainly', () => {
    const evac = metric(/Evacuation start/)
    expect(evac.config.clearanceMin).toBe(120)
    const r = runMetric(
      { id: 'threshold_timing', config: evac.config },
      {
        series,
        decisions: [decision('Mill Road crossing', '2026-11-07T10:30:00Z', 'order_evacuation')],
      },
    )
    const z = (r.data as { zones: Record<string, { status: string }> }).zones
    expect(z['Mill Road crossing']!.status).toBe('late') // the water arrives at 12:00Z; with 2 hours of clearance it was needed by 10:00Z
    expect(z['River Road mile 4']!.status).toBe('no_action')
  })
  it('has a configuration every metric in the toolkit accepts', () => {
    for (const m of toolkit.metrics) {
      const inputs =
        m.id === 'threshold_timing'
          ? { series, decisions: [] }
          : m.id === 'decision_timing'
            ? { events: [], decisions: [] }
            : { facts: [], statements: [] }
      expect(() => runMetric({ id: m.id, config: m.config }, inputs), m.label).not.toThrow()
    }
  })
})
