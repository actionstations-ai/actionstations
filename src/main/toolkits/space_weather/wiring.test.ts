// The space weather toolkit on the shared wiring (spec 0448, spec 0468): every capability it
// names has code, its decision forms are valid live forms, its field lint rules run on injects,
// and its metrics read the datasets the generator writes through the Evaluation input adapters.
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
const { DecisionForm } = await import('@shared/schemas/decisions')
const { liveFormsOf } = await import('../decision-forms')
const { fieldLintIssues, fieldLintRuleIds } = await import('../lint-rules')
const { unknownCapabilityWarnings } = await import('../capabilities')
const { registerSpaceWeatherToolkit } = await import('./register')
const { SpaceEventParams } = await import('./simulate')
const { runGenerator } = await import('../../case-data/generators')
const { caseDir } = await import('../../case-data/store')
const { readModeledSeries, readGroundTruth } = await import('../../evaluation/metrics/inputs')
const { runMetric } = await import('../../evaluation/metrics/registry')

registerSpaceWeatherToolkit()
registerSpaceWeatherToolkit()
const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/space_weather.json'), 'utf8')),
)

describe('capabilities', () => {
  it('has code for every lint rule, figure kind and metric the toolkit names', () => {
    for (const id of toolkit.lintRules) expect(fieldLintRuleIds(), id).toContain(id)
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })
})

describe('decision forms in live play', () => {
  const forms = liveFormsOf([toolkit])
  it('converts every toolkit form to a valid live form with its id as the kind', () => {
    expect(forms).toHaveLength(toolkit.decisionForms.length)
    for (const f of forms) {
      const parsed = DecisionForm.safeParse(f)
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
    }
    expect(toolkit.decisionForms.map((f) => f.id)).toEqual(
      expect.arrayContaining([
        'space_apply_procedure',
        'space_terminate_procedure',
        'space_disseminate',
        'space_switch_time_source',
        'space_safe_mode',
      ]),
    )
  })
  it('prefixes every form id with the field so no other toolkit shares a decision kind', () => {
    for (const f of toolkit.decisionForms) expect(f.id.startsWith('space_'), f.id).toBe(true)
  })
  it('records the site of a time source switch as an area the zone series can match', () => {
    const f = toolkit.decisionForms.find((x) => x.id === 'space_switch_time_source')!
    expect(f.fields.find((x) => x.id === 'site')?.kind).toBe('area')
  })
})

describe('lint rules on injects', () => {
  const preview = (type: string): Record<string, unknown> =>
    (
      JSON.parse(readFileSync(resolve(`templates/injects/${type}/preview.json`), 'utf8')) as {
        fields: Record<string, unknown>
      }
    ).fields

  it('accepts the sample data of every template the toolkit adds', () => {
    for (const type of toolkit.injectTypes)
      if (type !== 'space_figure') expect(fieldLintIssues(type, preview(type)), type).toEqual([])
  })
  it('flags a watch coded as an alert and a local issue time', () => {
    const fields = { ...preview('swpc_message'), productKind: 'ALERT', issueTime: '1058 AM EST' }
    const messages = fieldLintIssues('swpc_message', fields).map((i) => i.message)
    expect(messages.some((m) => /watch code/.test(m))).toBe(true)
    expect(messages.some((m) => /UTC as the products write it/.test(m))).toBe(true)
  })
  it('flags a Kp and G level that disagree in a situation report', () => {
    const issues = fieldLintIssues('sitrep', { summary: 'Kp 6 (G3) conditions continue.' })
    expect(issues[0]?.message).toMatch(/Kp 6 is G2, not G3/)
  })
  it('flags a CME discussion with a window of an hour', () => {
    const fields = preview('swpc_cme_discussion')
    const narrow = {
      ...fields,
      arrival: {
        ...(fields.arrival as object),
        earliest: '2026 Nov 06 1930 UTC',
        latest: '2026 Nov 06 2030 UTC',
      },
    }
    expect(fieldLintIssues('swpc_cme_discussion', narrow)[0]?.message).toMatch(/uncertain by hours/)
  })
  it('flags an ICAO advisory with a wrong DTG', () => {
    const fields = { ...preview('icao_space_weather_advisory'), dtg: '2026-11-05' }
    expect(fieldLintIssues('icao_space_weather_advisory', fields)[0]?.message).toMatch(/DTG/)
  })
})

describe('metrics read what the generator writes', () => {
  const params = SpaceEventParams.parse({
    flareTime: '2026-11-05T09:00:00Z',
    flareClass: 'X2.1',
    peakG: 4,
    peakS: 3,
    cmeSpeedKmS: 1500,
    receivers: [
      { name: 'Harbor central office', class: 'disciplined_oscillator', holdoverHours: 8 },
    ],
  })
  const setup = async () => {
    const root = mkdtempSync(join(tmpdir(), 'ttx-space-wire-'))
    const m = await runGenerator(root, 's', 'space-weather-event', params, {
      maxMbPerScenario: 500,
    })
    const dir = caseDir(root, 's')
    const file = (id: string) => m.datasets.find((d) => d.id === id)!.file!
    return { m, dir, file }
  }
  const ref = (series: string) => toolkit.metrics.find((x) => x.series === series)!
  const run = (id: string, config: Record<string, unknown>, bag: Record<string, unknown>) =>
    runMetric({ id, config } as never, bag as never)

  it('names only datasets the generator writes', async () => {
    const { m } = await setup()
    const ids = m.datasets.map((d) => d.id)
    for (const x of toolkit.metrics) {
      if (x.series) expect(ids, x.label).toContain(x.series)
      if (x.groundTruth) expect(ids, x.label).toContain(x.groundTruth)
    }
  })
  it('scores a procedure applied before the Kp condition as on time and after it as late', async () => {
    const { m, dir, file } = await setup()
    const series = await readModeledSeries(dir, file('zones-procedure'))
    const events = await readGroundTruth(dir, file('space-events'))
    const met = Date.parse(events.find((e) => e.kind === 'kp_condition_met')!.time)
    const r = ref('zones-procedure')
    const at = (ms: number) => [
      { id: 'd', time: new Date(ms).toISOString(), kind: 'space_apply_procedure', fields: {} },
    ]
    const status = (res: { data?: unknown }) =>
      (res.data as { zones: Record<string, { status: string }> }).zones[
        'GMD operating procedure condition'
      ]!.status
    expect(status(run(r.id, r.config, { series, decisions: at(met - 3 * 3_600_000) }))).toBe(
      'on_time',
    )
    expect(status(run(r.id, r.config, { series, decisions: at(met + 3 * 3_600_000) }))).toBe('late')
    expect(m.datasets.some((d) => d.id === 'zones-procedure')).toBe(true)
  })
  it('scores a failover before holdover expires, by the site the decision names', async () => {
    const { dir, file } = await setup()
    const series = await readModeledSeries(dir, file('zones-holdover'))
    const events = await readGroundTruth(dir, file('space-events'))
    expect(series.map((s) => s.zone)).toEqual(['Harbor central office'])
    const expiry = Date.parse(series[0]!.points.find((p) => p.value >= 0)!.time)
    const r = ref('zones-holdover')
    const at = (ms: number) => [
      {
        id: 'f',
        time: new Date(ms).toISOString(),
        kind: 'space_switch_time_source',
        area: 'Harbor central office',
        fields: {},
      },
    ]
    const status = (res: { data?: unknown }) =>
      (res.data as { zones: Record<string, { status: string }> }).zones['Harbor central office']!
        .status
    expect(status(run(r.id, r.config, { series, decisions: at(expiry - 3_600_000) }))).toBe(
      'on_time',
    )
    expect(status(run(r.id, r.config, { series, decisions: at(expiry + 3_600_000) }))).toBe('late')
    expect(events.length).toBeGreaterThan(3)
  })
  it('scores safe mode before the proton flux threshold', async () => {
    const { dir, file } = await setup()
    const series = await readModeledSeries(dir, file('zones-safe-mode'))
    const r = ref('zones-safe-mode')
    const none = run(r.id, r.config, { series, decisions: [] })
    expect(JSON.stringify(none.summary)).toContain('Zones with no action')
  })
  it('counts the entities in the plan that were told, from the dissemination decisions', async () => {
    const { dir, file } = await setup()
    const events = await readGroundTruth(dir, file('space-events'))
    const first = Date.parse(events.find((e) => e.kind === 'swpc_message')!.time)
    const r = toolkit.metrics.find((x) => x.id === 'space_dissemination')!
    const res = run(
      r.id,
      { ...r.config, entities: 'Harbor Generation, Northfield Cooperative, Cedar Point Utility' },
      {
        events,
        decisions: [
          {
            id: 'a',
            time: new Date(first + 20 * 60_000).toISOString(),
            kind: 'space_disseminate',
            fields: { entities: 'harbor generation; Northfield Cooperative' },
          },
        ],
      },
    )
    const d = res.data as { told: number; entities: number }
    expect(d.told).toBe(2)
    expect(d.entities).toBe(3)
    expect(JSON.stringify(res.tables)).toContain('Not told')
    expect(JSON.stringify(res.caveats)).toMatch(/does not replace/)
  })
})
