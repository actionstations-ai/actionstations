// The flooding toolkit on the shared registries: every id it names has code behind it, its format
// rules run through the field lint registry, and its metrics read the datasets its simulator
// writes (zone series and flash flood reports) through the same input adapters the Evaluation
// tab uses.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.1',
    getPath: () => tmpdir(),
    isPackaged: false,
    getAppPath: () => resolve('.'),
  },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_RESOURCES = resolve('.')

const { ToolkitSchema } = await import('@shared/toolkits')
const { unknownCapabilityWarnings } = await import('../capabilities')
const { fieldLintIssues } = await import('../lint-rules')
const { registerFloodingToolkit } = await import('./index')
const { RiverEventParams, FlashEventParams } = await import('./simulate')
const { runGenerator } = await import('../../case-data/generators')
const { caseDir } = await import('../../case-data/store')
const { readModeledSeries, readGroundTruth } = await import('../../evaluation/metrics/inputs')
const { runMetric } = await import('../../evaluation/metrics/registry')
const { liveFormsOf } = await import('../decision-forms')
const { DecisionForm: LiveDecisionForm } = await import('@shared/schemas/decisions')

const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/flooding.json'), 'utf8')),
)
registerFloodingToolkit()
registerFloodingToolkit()

describe('capabilities', () => {
  it('has code behind every figure kind, connector, metric and lint rule the toolkit names', () => {
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })
})

describe('decision forms', () => {
  it('convert to live forms that pass the live schema, with a drawable area where a place is named', () => {
    const forms = liveFormsOf([toolkit]).map((f) => LiveDecisionForm.parse(f))
    expect(forms.map((f) => f.id)).toEqual(toolkit.decisionForms.map((f) => f.id))
    const evac = forms.find((f) => f.id === 'order_evacuation')!
    expect(evac.fields.find((x) => x.type === 'area')).toMatchObject({ draw: true })
  })
})

describe('lint rules', () => {
  const warning = (tags: { name: string; value: string }[], at: string) => ({
    product: 'Flash Flood Warning',
    office: 'x',
    issued: 'x',
    warningFor: ['x'],
    until: 'x',
    at,
    tags,
  })
  it('flags a CATASTROPHIC tag without emergency language and accepts it with', () => {
    const tag = [{ name: 'FLASH FLOOD DAMAGE THREAT', value: 'CATASTROPHIC' }]
    expect(
      fieldLintIssues('nws_weather_warning', warning(tag, 'Flash flooding is ongoing.')).map(
        (i) => i.message,
      ),
    ).toEqual([expect.stringMatching(/CATASTROPHIC tag is used only with flash flood emergency/)])
    expect(
      fieldLintIssues(
        'nws_weather_warning',
        warning(tag, 'This is a FLASH FLOOD EMERGENCY for the camp road.'),
      ),
    ).toEqual([])
  })
  it('leaves other warnings alone', () => {
    expect(
      fieldLintIssues('nws_weather_warning', { ...warning([], 'x'), product: 'Tornado Warning' }),
    ).toEqual([])
  })
  it('flags a stage with no unit and not a count of days', () => {
    const f = (impacts: string) => ({
      office: 'x',
      product: 'Hydrologic Outlook',
      issued: 'x',
      headline: 'x',
      areas: ['a'],
      discussion: ['b'],
      impacts,
    })
    expect(
      fieldLintIssues('nws_hydrologic_product', f('The river stage will reach 17.8 by Monday.')),
    ).toHaveLength(1)
    expect(
      fieldLintIssues('nws_hydrologic_product', f('The river stage will reach 17.8 ft by Monday.')),
    ).toEqual([])
    expect(fieldLintIssues('nws_hydrologic_product', f('The next stage lasts 3 days.'))).toEqual([])
  })
})

describe('metrics read what the simulator writes', () => {
  const river = RiverEventParams.parse({
    river: 'Cedar River',
    start: '2026-11-05T12:00:00Z',
    crestAtHour: 48,
    recessionHours: 48,
    gauges: [
      {
        id: 'RBDM7',
        name: 'Cedar River at Riverbend',
        mile: 0,
        baseStage: 8,
        crestStage: 17,
        categories: { action: 12, flood: 14, minor: 14 },
      },
    ],
    assets: [
      { id: 'a', name: 'Mill Road', kind: 'road', floodsAtStage: 14 },
      { id: 'b', name: 'East Bend', kind: 'population', floodsAtStage: 15, count: 100 },
      { id: 'c', name: 'Water plant', kind: 'facility', floodsAtStage: 16 },
    ],
  })
  it('scores a closure against the zone series dataset the toolkit metric names', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ttx-flood-wire-'))
    const m = await runGenerator(
      root,
      's',
      'flood-river-event',
      { ...river },
      { maxMbPerScenario: 500 },
    )
    const ref = toolkit.metrics.find((x) => /Road and crossing closure/.test(x.label ?? ''))!
    const ds = m.datasets.find((d) => d.id === ref.series)!
    const series = await readModeledSeries(caseDir(root, 's'), ds.file!)
    expect(series.map((s) => s.zone)).toEqual(['Mill Road'])
    const crossing = series[0]!.points.find((p) => p.value >= 0)!.time
    const early = new Date(Date.parse(crossing) - 3_600_000).toISOString()
    const r = runMetric(
      { id: ref.id, config: ref.config },
      {
        series,
        decisions: [{ id: 'd', time: early, kind: 'close_road', area: 'Mill Road', fields: {} }],
      },
    )
    expect(
      (r.data as { zones: Record<string, { status: string }> }).zones['Mill Road']!.status,
    ).toBe('on_time')
    for (const m2 of toolkit.metrics.filter((x) => x.id === 'threshold_timing'))
      expect(
        m.datasets.map((d) => d.id),
        m2.label,
      ).toContain(m2.series)
  })
  it('scores warnings against the flash flood report dataset', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ttx-flood-wire-'))
    const p = FlashEventParams.parse({
      basin: 'Cedar Creek basin',
      gauge: {
        id: 'CCRM7',
        name: 'Cedar Creek at the camp road',
        baseStage: 1,
        peakStage: 11,
        categories: { action: 4, minor: 8 },
      },
      start: '2026-11-05T00:00:00Z',
      rainPeakHour: 3,
      rainDurationHours: 3,
      rainTotalInches: 4,
    })
    const m = await runGenerator(
      root,
      's',
      'flood-flash-event',
      { ...p },
      { maxMbPerScenario: 500 },
    )
    const ref = toolkit.metrics.find((x) => x.id === 'decision_timing')!
    const ds = m.datasets.find((d) => d.id === ref.groundTruth)!
    const events = await readGroundTruth(caseDir(root, 's'), ds.file!)
    expect(events).toHaveLength(1)
    const t = Date.parse(events[0]!.time)
    const r = runMetric(
      { id: ref.id, config: ref.config },
      {
        events,
        decisions: [
          {
            id: 'w',
            time: new Date(t - 30 * 60_000).toISOString(),
            kind: 'public_message',
            area: 'Cedar Creek basin',
            fields: {},
          },
        ],
      },
    )
    expect(JSON.stringify(r.summary)).toContain('1')
  })
})
