// The hospitality toolkits on the shared wiring (spec 0448, spec 0470): decision forms are valid
// live forms with the option ids the metrics read, lint rules run on injects, the generators'
// event datasets are read as ground truth, and the metrics run from those events and the team's
// decisions.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))
process.env.TTX_RESOURCES = resolve('.')

const { DecisionForm } = await import('@shared/schemas/decisions')
const { DomainProfile } = await import('@shared/domains/schema')
const { ToolkitSchema } = await import('@shared/toolkits')
const { liveFormsOf } = await import('../decision-forms')
const { fieldLintIssues, fieldLintRuleIds } = await import('../lint-rules')
const { unknownCapabilityWarnings } = await import('../capabilities')
const { registerHospitalityToolkit } = await import('./register')
const { HOSPITALITY_GENERATORS } = await import('./simulate/generators')
const { readGroundTruth, decisionsFromLog } = await import('../../evaluation/metrics/inputs')
const { runMetric } = await import('../../evaluation/metrics/registry')
const { generatorIds } = await import('../../case-data/generators')

registerHospitalityToolkit()
registerHospitalityToolkit()
const load = (name: string) =>
  ToolkitSchema.parse(JSON.parse(readFileSync(resolve(`packs/toolkits/${name}.json`), 'utf8')))
const outbreak = load('outbreak_at_sea')
const guest = load('guest_emergency')

describe('decision forms in live play', () => {
  const forms = liveFormsOf([outbreak, guest])

  it('converts every form to a valid live form with its id as the kind', () => {
    expect(forms).toHaveLength(outbreak.decisionForms.length + guest.decisionForms.length)
    for (const f of forms) {
      const parsed = DecisionForm.safeParse(f)
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
    }
  })

  it('has no form id the two toolkits share, and every id carries the field prefix', () => {
    const ids = [...outbreak.decisionForms, ...guest.decisionForms].map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^hosp_/)
  })

  it('uses the option ids the metrics read', () => {
    const report = DecisionForm.parse(
      forms.find((f) => (f as { id: string }).id === 'hosp_report_to_authority'),
    )
    const field = report.fields.find((f) => f.id === 'report')
    expect(field?.type === 'choice' && field.options.map((o) => o.id)).toEqual(
      expect.arrayContaining([
        '24_hour_report',
        '4_hour_update_report',
        'special_report_2_percent',
        'special_report_3_percent',
      ]),
    )
    const acct = DecisionForm.parse(
      forms.find((f) => (f as { id: string }).id === 'hosp_guest_accounting'),
    )
    const status = acct.fields.find((f) => f.id === 'status')
    expect(status?.type === 'choice' && status.options.map((o) => o.id)).toContain(
      'count_complete_all_accounted_for',
    )
  })
})

describe('code the toolkits name exists', () => {
  it('has no figure kind, metric or lint rule the app lacks', () => {
    expect(fieldLintRuleIds()).toEqual(
      expect.arrayContaining([...outbreak.lintRules, ...guest.lintRules]),
    )
    expect(unknownCapabilityWarnings(outbreak)).toEqual([])
    expect(unknownCapabilityWarnings(guest)).toEqual([])
  })

  it('has its generators registered by the shared module', () => {
    expect(generatorIds()).toEqual(expect.arrayContaining(HOSPITALITY_GENERATORS.map((g) => g.id)))
  })

  it('names the regulation the domain turns on', () => {
    const domain = DomainProfile.parse(
      JSON.parse(readFileSync(resolve('packs/domains/hospitality.json'), 'utf8')),
    )
    expect(domain.regulations).toEqual(['cdc_ship_illness_reporting'])
  })
})

describe('field lint rules, scoped to the toolkit', () => {
  const ids = [...outbreak.lintRules, ...guest.lintRules]
  it('flags a report whose percentage is wrong and accepts a correct one', () => {
    const good = {
      reportType: '24-hour report',
      hoursBeforeArrival: 25,
      passengersOnBoard: 2000,
      crewOnBoard: 800,
      passengerCases: 40,
      crewCases: 8,
      passengerPercent: '2.0%',
      crewPercent: '1.0%',
    }
    expect(fieldLintIssues('age_cumulative_report', good, ids)).toEqual([])
    expect(
      fieldLintIssues('age_cumulative_report', { ...good, passengerPercent: '4.0%' }, ids),
    ).toHaveLength(1)
  })

  it('runs nothing when the toolkit does not list the rule', () => {
    expect(
      fieldLintIssues('guest_letter', { body: ['Take 400 mg of ibuprofen.'] }, ['other_rule']),
    ).toEqual([])
  })
})

describe('simulated events as ground truth, scored by the metrics', () => {
  function written(id: string, datasetId: string, params: unknown): string {
    const g = HOSPITALITY_GENERATORS.find((x) => x.id === id)! as unknown as {
      params: { parse(p: unknown): unknown }
      generate(p: unknown): { id: string; data: unknown }[]
    }
    const dataset = g.generate(g.params.parse(params)).find((d) => d.id === datasetId)!
    const dir = mkdtempSync(join(tmpdir(), 'hosp-events-'))
    writeFileSync(join(dir, `${datasetId}.json`), JSON.stringify(dataset.data))
    return dir
  }
  const log = (i: number, at: string, kind: string, fields: Record<string, unknown>) => ({
    i,
    at,
    kind: 'decision.submitted',
    data: { structured: { kind, fields } },
  })

  it('scores reports against the simulated outbreak report points', async () => {
    const dir = written('hosp-outbreak-at-sea', 'hosp-outbreak-events', { seed: 3 })
    const events = await readGroundTruth(dir, 'hosp-outbreak-events.json')
    const kinds = events.map((e) => e.kind)
    expect(kinds).toEqual(
      expect.arrayContaining(['report_point_24h', 'report_point_4h', 'threshold_2pct']),
    )
    const p24 = events.find((e) => e.kind === 'report_point_24h')!
    const decisions = decisionsFromLog([
      log(1, new Date(Date.parse(p24.time) - 3_600_000).toISOString(), 'hosp_report_to_authority', {
        authority: 'cdc_vessel_sanitation_program',
        report: '24_hour_report',
      }),
    ])
    const r = runMetric({ id: 'hospitality_report_timeliness', config: {} }, { events, decisions })
    expect(r.data.onTime).toBe(1)
    expect(r.data.points).toBeGreaterThanOrEqual(3)
  })

  it('scores the 2 percent isolation timing with the shared decision timing metric', async () => {
    const dir = written('hosp-outbreak-at-sea', 'hosp-outbreak-events', { seed: 3 })
    const events = await readGroundTruth(dir, 'hosp-outbreak-events.json')
    const t2 = events
      .filter((e) => e.kind === 'threshold_2pct')
      .sort((a, b) => a.time.localeCompare(b.time))[0]!
    const decisions = decisionsFromLog([
      log(1, new Date(Date.parse(t2.time) + 30 * 60_000).toISOString(), 'hosp_isolate_and_clean', {
        scope: 'ill_passengers',
      }),
    ])
    const metric = outbreak.metrics.find((m) => m.id === 'decision_timing')!
    const r = runMetric({ id: metric.id, config: metric.config }, { events, decisions })
    expect(r.metricId).toBe('decision_timing')
  })

  it('scores a muster declaration against the persons found late', async () => {
    const dir = written('hosp-muster', 'hosp-muster-events', { seed: 5 })
    const events = await readGroundTruth(dir, 'hosp-muster-events.json')
    const start = events.find((e) => e.kind === 'muster_start')!
    const decisions = decisionsFromLog([
      log(
        1,
        new Date(Date.parse(start.time) + 28 * 60_000).toISOString(),
        'hosp_guest_accounting',
        {
          status: 'count_complete_all_accounted_for',
          unaccounted: 0,
        },
      ),
    ])
    const r = runMetric({ id: 'hospitality_accounting', config: {} }, { events, decisions })
    expect(r.data.falseClear).toBe(true)
    expect(r.data.missedAtClear as number).toBeGreaterThan(0)
  })
})
