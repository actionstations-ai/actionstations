// The epidemiology toolkit on the shared wiring (spec 0448, spec 0457): its decision forms are
// valid live forms, its lint rules run on injects, its generators' event datasets are read as
// ground truth, and its metrics run from those events and the team's decisions.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))
process.env.TTX_RESOURCES = resolve('.')

const { DecisionForm } = await import('@shared/schemas/decisions')
const { ToolkitSchema } = await import('@shared/toolkits')
const { liveFormsOf } = await import('../decision-forms')
const { fieldLintIssues, fieldLintRuleIds } = await import('../lint-rules')
const { unknownCapabilityWarnings } = await import('../capabilities')
const { registerEpidemiologyToolkit } = await import('./register')
const { EPI_GENERATORS } = await import('./simulate/generators')
const { readGroundTruth, decisionsFromLog } = await import('../../evaluation/metrics/inputs')
const { runMetric } = await import('../../evaluation/metrics/registry')
const { generatorIds } = await import('../../case-data/generators')
const { connectorIds } = await import('../connectors/registry')

registerEpidemiologyToolkit()
const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/epidemiology.json'), 'utf8')),
)

describe('decision forms in live play', () => {
  const forms = liveFormsOf([toolkit])

  it('converts every toolkit form to a valid live form with its id as the kind', () => {
    expect(forms).toHaveLength(toolkit.decisionForms.length)
    for (const f of forms) {
      const parsed = DecisionForm.safeParse(f)
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
    }
  })

  it('uses option ids the metrics read: reached, unreachable, open', () => {
    const outcome = DecisionForm.parse(
      forms.find((f) => (f as { id: string }).id === 'record_contact_outcome'),
    )
    const field = outcome.fields.find((f) => f.id === 'outcome')
    expect(field?.type === 'choice' && field.options.map((o) => o.id)).toEqual([
      'reached',
      'unreachable',
    ])
    const site = DecisionForm.parse(
      forms.find((f) => (f as { id: string }).id === 'open_dispensing_site'),
    )
    const action = site.fields.find((f) => f.id === 'action')
    expect(action?.type === 'choice' && action.options.map((o) => o.id)).toContain('open')
  })
})

describe('code the toolkit names exists', () => {
  it('has no figure kind, connector, metric or lint rule the app lacks', () => {
    expect(connectorIds()).toEqual(expect.arrayContaining(toolkit.connectors))
    expect(fieldLintRuleIds()).toEqual(expect.arrayContaining(toolkit.lintRules))
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })

  it('has its generators registered by the shared module', () => {
    expect(generatorIds()).toEqual(expect.arrayContaining(EPI_GENERATORS.map((g) => g.id)))
  })
})

describe('field lint rules', () => {
  const notice = (over: Record<string, unknown> = {}) => ({
    caseOnset: '2026-10-19T00:00:00Z',
    pathogenId: 'measles',
    exposures: [
      {
        place: 'Clinic',
        window: 'Oct 16',
        startsAt: '2026-10-16T14:00:00Z',
        endsAt: '2026-10-16T20:00:00Z',
      },
    ],
    ...over,
  })

  it('accepts an exposure window inside the infectious period and flags one outside', () => {
    expect(fieldLintIssues('exposure_notice', notice())).toEqual([])
    const bad = notice({
      exposures: [
        {
          place: 'School',
          window: 'Oct 5',
          startsAt: '2026-10-05T12:00:00Z',
          endsAt: '2026-10-05T15:00:00Z',
        },
      ],
    })
    const issues = fieldLintIssues('exposure_notice', bad)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toMatch(/School.*does not overlap/)
  })

  it('checks nothing without the structured fields', () => {
    expect(
      fieldLintIssues('exposure_notice', { exposures: [{ place: 'x', window: 'y' }] }),
    ).toEqual([])
  })

  it("flags a count that differs from the inject's own line list", () => {
    const fields = {
      text: '14 confirmed cases were reported.',
      figures: {
        main: {
          kind: 'epi_line_list',
          data: {
            rows: [
              { id: 'A1', status: 'confirmed' },
              { id: 'A2', status: 'confirmed' },
            ],
          },
        },
      },
    }
    const issues = fieldLintIssues('sitrep', fields)
    expect(issues.map((i) => i.message).join(' ')).toMatch(
      /States 14 confirmed but the line list has 2/,
    )
    expect(
      fieldLintIssues('sitrep', { ...fields, text: '2 confirmed cases were reported.' }),
    ).toEqual([])
    expect(fieldLintIssues('sitrep', { text: '14 confirmed cases.' })).toEqual([])
  })

  it('flags a curve described as drawn by report date', () => {
    const issues = fieldLintIssues('figure', {
      caption: 'The epidemic curve by date of report shows the peak.',
    })
    expect(issues[0]!.message).toMatch(/onset date, not by report date/)
    expect(
      fieldLintIssues('figure', { caption: 'The epidemic curve by onset date shows the peak.' }),
    ).toEqual([])
  })
})

describe('simulated events as ground truth, scored by the metrics', () => {
  function written(generatorId: string, datasetId: string, params: unknown): string {
    const g = EPI_GENERATORS.find((x) => x.id === generatorId)! as unknown as {
      params: { parse(p: unknown): unknown }
      generate(p: unknown): { id: string; data: unknown }[]
    }
    const dataset = g.generate(g.params.parse(params)).find((d) => d.id === datasetId)!
    const dir = mkdtempSync(join(tmpdir(), 'epi-events-'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${datasetId}.json`), JSON.stringify(dataset.data))
    return dir
  }

  it("reads contact listing events and scores the team's outcomes", async () => {
    const dir = written('epi-contacts', 'epi-contact-events', {})
    const events = await readGroundTruth(dir, 'epi-contact-events.json')
    expect(events.length).toBeGreaterThan(20)
    expect(events.every((e) => e.kind === 'contact_listed')).toBe(true)
    const first = events.find((e) => e.attrs.close === true)!
    const when = new Date(Date.parse(first.time) + 3 * 3_600_000).toISOString()
    const decisions = decisionsFromLog([
      {
        i: 1,
        at: when,
        kind: 'decision.submitted',
        data: {
          structured: {
            kind: 'record_contact_outcome',
            fields: { contact: first.attrs.contact, outcome: 'reached' },
          },
        },
      },
    ])
    const r = runMetric({ id: 'contact_reach', config: { targetHours: 24 } }, { events, decisions })
    expect(r.data.onTime).toBe(1)
    expect(r.data.open).toBe((r.data.counted as number) - 1)
  })

  it('reads case events: a first report and one onset per case, and scores a curve', async () => {
    const dir = written('epi-common-source', 'epi-case-events', { seed: 3 })
    const events = await readGroundTruth(dir, 'epi-case-events.json')
    expect(events.filter((e) => e.kind === 'first_report')).toHaveLength(1)
    const onsets = events.filter((e) => e.kind === 'case_onset')
    expect(onsets.length).toBeGreaterThan(10)
    const dayMs = 86_400_000
    const start = Math.floor(Math.min(...onsets.map((e) => Date.parse(e.time))) / dayMs) * dayMs
    const bins = Math.ceil((Math.max(...onsets.map((e) => Date.parse(e.time))) - start) / dayMs) + 1
    const counts = Array.from(
      { length: bins },
      (_, i) => onsets.filter((e) => Math.floor((Date.parse(e.time) - start) / dayMs) === i).length,
    )
    const decisions = decisionsFromLog([
      {
        i: 1,
        at: new Date().toISOString(),
        kind: 'decision.submitted',
        data: {
          structured: {
            kind: 'submit_epi_curve',
            fields: {
              team: 'Team A',
              start: new Date(start).toISOString(),
              counts: counts.join(', '),
            },
          },
        },
      },
    ])
    const r = runMetric({ id: 'curve_accuracy', config: { binHours: 24 } }, { events, decisions })
    expect(r.data.byCurve).toMatchObject({ 'Team A': { matches: true } })
  })

  it('reads the dispensing activation event', async () => {
    const dir = written('epi-dispensing', 'epi-dispensing-events', { site: 'POD 7' })
    const events = await readGroundTruth(dir, 'epi-dispensing-events.json')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'mcm_activation', attrs: { site: 'POD 7' } })
  })
})
