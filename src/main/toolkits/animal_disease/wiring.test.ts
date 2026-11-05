// The animal disease toolkit on the shared wiring (spec 0448, spec 0460): every capability it
// names has code, its decision forms are valid live forms with the option ids the metrics read,
// its lint rules run, its generators' event datasets are read as ground truth, and its metrics
// run from those events and the team's decisions.
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
const { fieldLintRuleIds } = await import('../lint-rules')
const { unknownCapabilityWarnings } = await import('../capabilities')
const { listFigureKinds } = await import('../../render/figures')
const { generatorIds } = await import('../../case-data/generators')
const { connectorIds } = await import('../connectors/registry')
const { registerAnimalDiseaseToolkit } = await import('./register')
const { ANIMAL_GENERATORS } = await import('./simulate/generators')
const { readGroundTruth, decisionsFromLog } = await import('../../evaluation/metrics/inputs')
const { runMetric } = await import('../../evaluation/metrics/registry')
await import('../generator-modules')

registerAnimalDiseaseToolkit()
registerAnimalDiseaseToolkit()
const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/animal_disease.json'), 'utf8')),
)

describe('code the toolkit names exists', () => {
  it('has no unknown capabilities', () => {
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })

  it('registers its figure kinds beside the shared epidemiology kinds it reuses', () => {
    const have = listFigureKinds()
    for (const id of toolkit.figureKinds) expect(have, id).toContain(id)
    expect(toolkit.figureKinds).toEqual(
      expect.arrayContaining(['epi_curve', 'epi_contact_network']),
    )
  })

  it('registers the lint rules, the connector and the generators', () => {
    for (const id of toolkit.lintRules) expect(fieldLintRuleIds()).toContain(id)
    expect(connectorIds()).toContain('aphis-hpai')
    expect(generatorIds()).toEqual(expect.arrayContaining(ANIMAL_GENERATORS.map((g) => g.id)))
  })

  it('names core capabilities with critical tasks and no unverified framework mapping', () => {
    expect(toolkit.capabilities.map((c) => c.coreCapability)).toEqual([
      'operational_coordination',
      'public_information_and_warning',
      'situational_assessment',
      'supply_chain_integrity_and_security',
      'environmental_response_health_and_safety',
    ])
    for (const c of toolkit.capabilities) expect(c.criticalTasks.length).toBeGreaterThanOrEqual(3)
  })
})

describe('decision forms in live play', () => {
  const forms = liveFormsOf([toolkit])
  const form = (id: string) =>
    DecisionForm.parse(forms.find((f) => (f as { id: string }).id === id))

  it('converts every toolkit form to a valid live form with its id as the kind', () => {
    expect(forms).toHaveLength(toolkit.decisionForms.length)
    expect(toolkit.decisionForms.map((f) => f.id)).toEqual([
      'animal_order_quarantine',
      'animal_establish_control_area',
      'animal_change_designation',
      'animal_movement_permit_decision',
      'animal_set_depopulation_order',
      'animal_choose_disposal_site',
      'animal_request_federal_resources',
      'animal_request_emergency_declaration',
      'animal_release_control_area',
      'animal_publish_notice',
      'animal_record_depopulation',
      'animal_record_sample',
    ])
    for (const f of forms) {
      const parsed = DecisionForm.safeParse(f)
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
    }
  })

  it('uses the option ids the continuity metric reads', () => {
    const field = form('animal_movement_permit_decision').fields.find((f) => f.id === 'decision')
    expect(field?.type === 'choice' && field.options.map((o) => o.id)).toEqual([
      'issue',
      'issue_with_conditions',
      'deny',
    ])
  })

  it('lets the control area be drawn on the map', () => {
    const area = form('animal_establish_control_area').fields.find((f) => f.id === 'area')
    expect(area?.type).toBe('area')
  })
})

describe('simulated events as ground truth, scored by the metrics', () => {
  function written(generatorId: string, datasetId: string, params: unknown): string {
    const g = ANIMAL_GENERATORS.find((x) => x.id === generatorId)! as unknown as {
      params: { parse(p: unknown): unknown }
      generate(p: unknown): { id: string; data: unknown }[]
    }
    const dataset = g.generate(g.params.parse(params)).find((d) => d.id === datasetId)!
    const dir = mkdtempSync(join(tmpdir(), 'animal-events-'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${datasetId}.json`), JSON.stringify(dataset.data))
    return dir
  }
  const params = { spread: { baseDailyProb: 0.2, days: 40 } }
  const decide = (at: string, kind: string, fields: Record<string, unknown>, i = 1) =>
    decisionsFromLog([
      { i, at, kind: 'decision.submitted', data: { structured: { kind, fields } } },
    ])

  it('scores time to quarantine against the presumptive positive event', async () => {
    const dir = written('animal-premises-spread', 'animal-events', params)
    const events = await readGroundTruth(dir, 'animal-events.json')
    const first = events.find((e) => e.kind === 'presumptive_positive')!
    const at = new Date(Date.parse(first.time) + 90 * 60_000).toISOString()
    const decisions = decide(at, 'animal_order_quarantine', { premises: first.attrs.premises })
    const m = toolkit.metrics[0]!
    const r = runMetric({ id: m.id, config: m.config }, { events, decisions })
    expect(r.data.hits).toBe(1)
  })

  it('scores depopulation timing from the event and the recorded completion', async () => {
    const dir = written('animal-premises-spread', 'animal-events', params)
    const events = await readGroundTruth(dir, 'animal-events.json')
    const pp = events.filter((e) => e.kind === 'presumptive_positive')
    expect(pp.length).toBeGreaterThan(1)
    const decisions = decide(
      new Date(Date.parse(pp[0]!.time) + 20 * 3_600_000).toISOString(),
      'animal_record_depopulation',
      { premises: pp[0]!.attrs.premises },
    )
    const r = runMetric(
      { id: 'animal_depop_timing', config: { goalHours: 24 } },
      { events, decisions },
    )
    expect(r.data).toMatchObject({ premises: pp.length, withinGoal: 1, open: pp.length - 1 })
  })

  it('writes sample due and permit request events for the other metrics', async () => {
    const dir = written('animal-premises-spread', 'animal-events', params)
    const events = await readGroundTruth(dir, 'animal-events.json')
    const due = events.filter((e) => e.kind === 'sampling_due')
    const requests = events.filter((e) => e.kind === 'permit_request')
    expect(due.length).toBeGreaterThan(0)
    expect(requests.length).toBeGreaterThan(0)
    const sample = decide(due[0]!.time, 'animal_record_sample', {
      premises: due[0]!.attrs.premises,
    })
    const s = runMetric(
      { id: 'animal_surveillance_on_schedule', config: {} },
      { events, decisions: sample },
    )
    expect(s.data).toMatchObject({ due: due.length, onSchedule: 1 })
    const permit = decide(
      new Date(Date.parse(requests[0]!.time) + 2 * 3_600_000).toISOString(),
      'animal_movement_permit_decision',
      { premises: requests[0]!.attrs.premises, decision: 'issue_with_conditions' },
    )
    const c = runMetric(
      { id: 'animal_continuity', config: { serviceTargetHours: 24 } },
      { events, decisions: permit },
    )
    expect(c.data).toMatchObject({ requests: requests.length, decidedOnTime: 1, ableToMove: 1 })
  })

  it('reads the depopulation completions with head counts for the disposal backlog', async () => {
    const dir = written('animal-depop-capacity', 'animal-depop-events', params)
    const events = await readGroundTruth(dir, 'animal-depop-events.json')
    expect(events.length).toBeGreaterThan(0)
    expect(
      events.every((e) => e.kind === 'depop_complete' && typeof e.attrs.head === 'number'),
    ).toBe(true)
    const r = runMetric(
      { id: 'animal_disposal_backlog', config: { maxWaitHours: 12 } },
      { events, decisions: [] },
    )
    expect(r.data.waiting).toBe(events.length)
    expect(r.data.waitingHead).toBeGreaterThan(0)
  })
})
