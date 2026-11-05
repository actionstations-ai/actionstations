// The justice toolkit on the shared wiring (spec 0448, spec 0465): its decision forms are valid
// live forms, its figure kinds, metrics and lint rules exist, and its metrics run from the
// simulated events and the team's decisions.
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
const { ToolkitSchema, suggestToolkits } = await import('@shared/toolkits')
const { liveFormsOf } = await import('../decision-forms')
const { unknownCapabilityWarnings } = await import('../capabilities')
const { registerJusticeToolkit } = await import('./register')
const sim = await import('./simulate')
const { readGroundTruth, decisionsFromLog } = await import('../../evaluation/metrics/inputs')
const { runMetric } = await import('../../evaluation/metrics/registry')
await import('../../render/figures')

registerJusticeToolkit()
registerJusticeToolkit()
const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/justice.json'), 'utf8')),
)

describe('toolkit wiring', () => {
  it('names only code the app has', () => {
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })

  it('has the fourteen decisions of the spec, each with a field prefix', () => {
    expect(toolkit.decisionForms).toHaveLength(14)
    for (const f of toolkit.decisionForms) expect(f.id).toMatch(/^justice_/)
  })

  it('ties critical tasks to the seven capabilities the spec lists', () => {
    expect(toolkit.capabilities.map((c) => c.coreCapability)).toEqual([
      'operational_coordination',
      'operational_communications',
      'public_information_and_warning',
      'on_scene_security_protection_and_law_enforcement',
      'situational_assessment',
      'mass_care_services',
      'cybersecurity',
    ])
    for (const c of toolkit.capabilities) expect(c.criticalTasks.length).toBeGreaterThanOrEqual(2)
  })
})

describe('decision forms in live play', () => {
  const forms = liveFormsOf([toolkit])
  it('converts every form to a valid live form with its id as the kind', () => {
    expect(forms).toHaveLength(toolkit.decisionForms.length)
    for (const f of forms) {
      const parsed = DecisionForm.safeParse(f)
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
    }
  })

  it('offers court systems as option ids that match the simulated event ids', () => {
    const restore = DecisionForm.parse(
      forms.find((f) => (f as { id: string }).id === 'justice_restore_system'),
    )
    const system = restore.fields.find((f) => f.id === 'system')
    expect(system?.type === 'choice' && system.options.map((o) => o.id)).toEqual([
      'telephones',
      'public_website',
      'case_management',
      'e_filing',
    ])
  })

  it('records the five AMBER criteria as met, not met or unclear', () => {
    const amber = DecisionForm.parse(
      forms.find((f) => (f as { id: string }).id === 'justice_decide_amber_criteria'),
    )
    const choices = amber.fields.filter((f) => f.type === 'choice')
    expect(choices).toHaveLength(5)
    for (const c of choices)
      expect(c.type === 'choice' && c.options.map((o) => o.id)).toEqual([
        'met',
        'not_met',
        'unclear',
      ])
  })
})

describe('suggestions', () => {
  it('is proposed to a school scenario that mentions unified command', () => {
    const out = suggestToolkits({
      available: [toolkit],
      active: [],
      text: 'A school exercise on unified command and family reunification',
      domainId: 'k12_schools',
    })
    expect(out.map((s) => s.toolkitId)).toContain('justice')
  })
})

function written(
  generator: {
    generate(p: unknown): { id: string; data: unknown }[]
    params: { parse(p: unknown): unknown }
  },
  id: string,
  params: unknown = {},
): string {
  const dataset = generator.generate(generator.params.parse(params)).find((d) => d.id === id)!
  const dir = mkdtempSync(join(tmpdir(), 'justice-metrics-'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${id}.json`), JSON.stringify(dataset.data))
  return dir
}

const decide = (at: string, kind: string, fields: Record<string, unknown> = {}) => ({
  i: Math.floor(Date.parse(at) / 1000),
  at,
  kind: 'decision.submitted',
  data: { structured: { kind, fields } },
})

const metricOf = (label: string) => toolkit.metrics.find((m) => m.label === label)!

describe('metrics scored from simulated events and decisions', () => {
  it('scores time to unified command from the first arrival to the later of the two decisions', async () => {
    const dir = written(sim.justiceIncidentTimelineGenerator as never, 'justice-incident-events', {
      startTime: '2026-10-28T14:00:00Z',
      firstArrivalMin: 4,
    })
    const events = await readGroundTruth(dir, 'justice-incident-events.json')
    const decisions = decisionsFromLog([
      decide('2026-10-28T14:10:00Z', 'justice_establish_command_post'),
      decide('2026-10-28T14:22:00Z', 'justice_establish_unified_command'),
    ])
    const m = metricOf('Time to unified command')
    const r = runMetric({ id: m.id, config: m.config }, { events, decisions })
    expect(r.data).toMatchObject({ minutes: 18, complete: true, decisionsMade: 2 })
    expect(r.summary.find((s) => s.label === 'Result')!.value).toBe('within target')
  })

  it('reports an incomplete result when a required decision is missing', async () => {
    const dir = written(sim.justiceIncidentTimelineGenerator as never, 'justice-incident-events')
    const events = await readGroundTruth(dir, 'justice-incident-events.json')
    const decisions = decisionsFromLog([
      decide('2026-10-28T14:10:00Z', 'justice_establish_command_post'),
    ])
    const m = metricOf('Time to unified command')
    const r = runMetric({ id: m.id, config: m.config }, { events, decisions })
    expect(r.data).toMatchObject({ minutes: null, complete: false, decisionsMade: 1 })
  })

  it('scores each court function against its own recovery time objective', async () => {
    const dir = written(sim.justiceCourtOutageGenerator as never, 'justice-court-events', {
      startTime: '2026-10-28T08:00:00Z',
    })
    const events = await readGroundTruth(dir, 'justice-court-events.json')
    const decisions = decisionsFromLog([
      decide('2026-10-28T10:00:00Z', 'justice_restore_system', { system: 'telephones' }),
      decide('2026-10-31T12:00:00Z', 'justice_restore_system', { system: 'case_management' }),
    ])
    const m = metricOf('Time to restore each court function')
    const r = runMetric({ id: m.id, config: m.config }, { events, decisions })
    expect(r.data).toMatchObject({ total: 4, answered: 2, withinTarget: 1 })
  })

  it('scores the accurate count from the first count to the declaration', async () => {
    const dir = written(sim.justiceJailCountGenerator as never, 'justice-count-events', {
      startTime: '2026-10-28T15:00:00Z',
      countAtMin: 20,
    })
    const events = await readGroundTruth(dir, 'justice-count-events.json')
    const decisions = decisionsFromLog([
      decide('2026-10-28T15:50:00Z', 'justice_declare_count_clear'),
    ])
    const m = metricOf('Time to accurate count')
    const r = runMetric({ id: m.id, config: m.config }, { events, decisions })
    expect(r.data).toMatchObject({ minutes: 30, complete: true })
  })

  it('scores dispatch service level from the call surge', async () => {
    const dir = written(sim.justiceCallSurgeGenerator as never, 'justice-call-events', {
      calls: 40,
      units: 40,
    })
    const events = await readGroundTruth(dir, 'justice-call-events.json')
    const m = metricOf('Dispatch service level in a call surge')
    const r = runMetric({ id: m.id, config: m.config }, { events })
    expect(r.data.calls).toBe(40)
    expect(r.data.shareOnTime).toBeGreaterThan(0.5)
  })

  it('times the AMBER Alert against the first report with the generic decision timing metric', async () => {
    const dir = written(sim.justiceIncidentTimelineGenerator as never, 'justice-incident-events', {
      startTime: '2026-10-28T14:00:00Z',
    })
    const events = await readGroundTruth(dir, 'justice-incident-events.json')
    const decisions = decisionsFromLog([
      decide('2026-10-28T14:31:00Z', 'justice_issue_amber_alert'),
    ])
    const m = metricOf('AMBER Alert issue time after the first report')
    const r = runMetric({ id: m.id, config: m.config }, { events, decisions })
    expect(r.data).toMatchObject({ hits: 1 })
  })
})
