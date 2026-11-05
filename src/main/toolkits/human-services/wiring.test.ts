// The human services toolkits on the shared registries: every id they name has code behind it,
// their decision forms convert to valid live forms with the option ids the metrics read, their
// lint rules run, and their metrics read the datasets the simulators write, through the same
// input adapters the Evaluation tab uses.
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
const { runGenerator } = await import('../../case-data/generators')
const { caseDir } = await import('../../case-data/store')
const { readModeledSeries, readGroundTruth } = await import('../../evaluation/metrics/inputs')
const { runMetric } = await import('../../evaluation/metrics/registry')
const { liveFormsOf } = await import('../decision-forms')
const { DecisionForm: LiveDecisionForm } = await import('@shared/schemas/decisions')
const { runReunification } = await import('./simulate/reunification')
const { runDisplaced } = await import('./simulate/displaced')
const { NEED_LABEL } = await import('./simulate/shelter')
await import('./register-generators')

const load = (id: string) =>
  ToolkitSchema.parse(JSON.parse(readFileSync(resolve(`packs/toolkits/${id}.json`), 'utf8')))
const crisis = load('crisis_line')
const mass = load('mass_care')
const reun = load('reunification_child_welfare')
const safeguards = load('behavioral_safeguards')
const ALL = [safeguards, crisis, mass, reun]

const root = mkdtempSync(join(tmpdir(), 'ttx-hs-wire-'))
const deps = { maxMbPerScenario: 500 }
const manifests = {
  crisis: await runGenerator(root, 'crisis', 'hs-contact-surge', { seed: 1, multiplier: 3 }, deps),
  shelter: await runGenerator(root, 'shelter', 'hs-shelter-population', { seed: 1 }, deps),
  reunion: await runGenerator(root, 'reunion', 'hs-reunification-flow', { seed: 1 }, deps),
  displaced: await runGenerator(root, 'displaced', 'hs-displaced-children', { seed: 1 }, deps),
}
const seriesOf = async (scenario: keyof typeof manifests, id: string) => {
  const ds = manifests[scenario].datasets.find((d) => d.id === id)!
  return readModeledSeries(caseDir(root, scenario), ds.file!)
}
const eventsOf = async (scenario: keyof typeof manifests, id: string) => {
  const ds = manifests[scenario].datasets.find((d) => d.id === id)!
  return readGroundTruth(caseDir(root, scenario), ds.file!)
}
const iso = (ms: number) => new Date(ms).toISOString()

describe('capabilities', () => {
  it.each(ALL.map((t) => [t.id, t] as const))(
    '%s has code behind everything it names',
    (_id, t) => {
      expect(unknownCapabilityWarnings(t)).toEqual([])
    },
  )

  it('names the metric datasets the generators write', () => {
    const written = new Set(Object.values(manifests).flatMap((m) => m.datasets.map((d) => d.id)))
    for (const t of ALL)
      for (const m of t.metrics) {
        if (m.series) expect(written, `${t.id}: ${m.label}`).toContain(m.series)
        if (m.groundTruth) expect(written, `${t.id}: ${m.label}`).toContain(m.groundTruth)
      }
  })

  it('lists the safe messaging rules in every toolkit that can touch a crisis topic', () => {
    for (const t of [safeguards, crisis, mass, reun])
      expect(t.lintRules, t.id).toEqual(
        expect.arrayContaining(['hs_safe_messaging', 'hs_exercise_helpline']),
      )
  })
})

describe('decision forms', () => {
  it('convert to live forms that pass the live schema and carry the option ids the metrics read', () => {
    for (const t of [crisis, mass, reun]) {
      const forms = liveFormsOf([t]).map((f) => LiveDecisionForm.parse(f))
      expect(forms.map((f) => f.id)).toEqual(t.decisionForms.map((f) => f.id))
    }
    const release = liveFormsOf([reun])
      .map((f) => LiveDecisionForm.parse(f))
      .find((f) => f.id === 'hs_release_student')!
    const check = release.fields.find((f) => f.id === 'identity_check')!
    expect(check.type === 'choice' && check.options.map((o) => o.id)).toEqual([
      'verified_photo_identification',
      'verified_exception_approved_by_commander',
      'not_verified_sent_to_exceptions',
    ])
  })

  it('give every form an id with the field prefix and offer the needs the generator writes', () => {
    for (const t of [crisis, mass, reun])
      for (const f of t.decisionForms) expect(f.id).toMatch(/^hs_/)
    const assign = mass.decisionForms.find((f) => f.id === 'hs_assign_fnss_support')!
    const need = assign.fields.find((f) => f.id === 'need')!
    expect(need.choices).toEqual(Object.values(NEED_LABEL))
  })
})

describe('lint rules', () => {
  it('flag a method beside a suicide reference in a contact summary', () => {
    const issues = fieldLintIssues('hs_contact_summary', {
      situation: 'The texter talked about suicide and the pills at home.',
    })
    expect(issues.map((i) => i.message).join(' ')).toMatch(/method, means or place/)
  })

  it('flag a wrong rerouting timer and a separate-tier shelter, and accept the right ones', () => {
    expect(
      fieldLintIssues('hs_state_coordinator_briefing', {
        situation: 'Texts reroute to backup after 2 minutes.',
      }).length,
    ).toBe(1)
    expect(
      fieldLintIssues('hs_shelter_status_report', {
        issues: 'Move him to the special needs shelter.',
      }).length,
    ).toBe(1)
    expect(
      fieldLintIssues('hs_shelter_status_report', { issues: 'Support him in the general area.' }),
    ).toEqual([])
  })

  it('are all listed by the toolkits that use them, so a scenario that turns the toolkit on gets them', () => {
    const listed = new Set(ALL.flatMap((t) => t.lintRules))
    for (const id of [
      'hs_safe_messaging',
      'hs_exercise_helpline',
      'hs_no_real_line_for_players',
      'hs_988_routing',
      'hs_fnss_integration',
      'hs_crisis_counseling_duration',
      'hs_release_identity',
    ])
      expect(listed.has(id), id).toBe(true)
  })
})

describe('crisis line metrics read the surge datasets', () => {
  it('scores service level by channel from the queue series', async () => {
    const ref = crisis.metrics.find((m) => m.id === 'service_level')!
    const series = await seriesOf('crisis', ref.series!)
    const r = runMetric({ id: ref.id, config: ref.config }, { series })
    const zones = (r.data as { zones: Record<string, { answerRate: number; offered: number }> })
      .zones
    expect(Object.keys(zones).sort()).toEqual(['Calls', 'Chats', 'Texts'])
    expect(zones.Texts!.offered).toBeGreaterThan(0)
    expect(zones.Texts!.answerRate).toBeGreaterThan(0)
    expect(zones.Texts!.answerRate).toBeLessThanOrEqual(1)
    expect(JSON.stringify(r.inputs)).toContain('Federal goal for texts and chats')
  })

  it('scores a surge decision made before the queue passed the timer as a hit', async () => {
    const ref = crisis.metrics.find((m) => m.id === 'decision_timing')!
    const events = await eventsOf('crisis', ref.groundTruth!)
    const over = events.find((e) => e.kind === 'queue_over_timer')!
    const r = runMetric(
      { id: ref.id, config: ref.config },
      {
        events,
        decisions: [
          {
            id: 'd1',
            time: iso(Date.parse(over.time) - 10 * 60_000),
            kind: 'hs_activate_surge_plan',
            fields: {},
          },
        ],
      },
    )
    expect(JSON.stringify(r.summary)).toMatch(/Hits|hit/i)
    expect(
      runMetric({ id: ref.id, config: ref.config }, { events, decisions: [] }).data,
    ).not.toEqual(r.data)
  })
})

describe('mass care metrics read the shelter datasets', () => {
  it('scores opening a shelter against the wind crossing tropical-storm force', async () => {
    const ref = mass.metrics.find((m) => m.id === 'threshold_timing')!
    const series = await seriesOf('shelter', ref.series!)
    const site = series[0]!.zone
    const crossing = series[0]!.points.find((p) => p.value >= 39)!.time
    const r = runMetric(
      { id: ref.id, config: ref.config },
      {
        series,
        decisions: [
          {
            id: 'o',
            time: iso(Date.parse(crossing) - 4 * 3_600_000),
            kind: 'hs_open_shelter',
            area: site,
            fields: {},
          },
        ],
      },
    )
    const zones = (r.data as { zones: Record<string, { status: string }> }).zones
    expect(zones[site]!.status).toBe('on_time')
    const late = runMetric(
      { id: ref.id, config: ref.config },
      {
        series,
        decisions: [
          {
            id: 'o',
            time: iso(Date.parse(crossing) - 30 * 60_000),
            kind: 'hs_open_shelter',
            area: site,
            fields: {},
          },
        ],
      },
    )
    expect((late.data as { zones: Record<string, { status: string }> }).zones[site]!.status).toBe(
      'late',
    )
  })

  it('measures doors open after the decision', async () => {
    const ref = mass.metrics.find((m) => m.id === 'time_to_completion')!
    const t = Date.parse('2026-11-02T13:00:00Z')
    const r = runMetric(
      { id: ref.id, config: ref.config },
      {
        events: [],
        decisions: [
          { id: 'a', time: iso(t), kind: 'hs_open_shelter', fields: {} },
          {
            id: 'b',
            time: iso(t + 90 * 60_000),
            kind: 'hs_report_shelter_doors_open',
            fields: { site: 'Eastside' },
          },
        ],
      },
    )
    expect((r.data as { medianMin: number }).medianMin).toBe(90)
  })

  it('counts needs met by category and place, and times each', async () => {
    const ref = mass.metrics.find((m) => m.id === 'needs_coverage')!
    const events = await eventsOf('shelter', ref.groundTruth!)
    const needs = events.filter((e) => e.kind === 'need_recorded')
    expect(needs.length).toBeGreaterThan(5)
    const first = needs[0]!
    const label = String(first.attrs.label)
    const choiceId = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
    const r = runMetric(
      { id: ref.id, config: ref.config },
      {
        events,
        decisions: [
          {
            id: 'n1',
            time: iso(Date.parse(first.time) + 20 * 60_000),
            kind: 'hs_assign_fnss_support',
            area: first.area!,
            fields: { need: choiceId, count: 1 },
          },
        ],
      },
    )
    const d = r.data as { met: number; recorded: number; medianMin: number }
    expect(d.recorded).toBe(needs.length)
    expect(d.met).toBe(1)
    expect(d.medianMin).toBeCloseTo(20, 5)
  })
})

describe('reunification and child welfare metrics', () => {
  it('measures every student released after the site was activated, leaving exceptions open', async () => {
    const ref = reun.metrics.find((m) => /student/.test(m.label ?? ''))!
    const events = await eventsOf('reunion', ref.groundTruth!)
    const activated = events.find((e) => e.kind === 'site_activated')!
    const run = runReunification({ seed: 1 })
    const verified = run.students.filter((s) => s.releaseReadyMin !== undefined)
    const decisions = verified.map((s, i) => ({
      id: `r${i}`,
      time: iso(Date.parse(activated.time) + s.releaseReadyMin! * 60_000),
      kind: 'hs_release_student',
      fields: { student: s.ref, identity_check: 'verified_photo_identification' },
    }))
    const r = runMetric({ id: ref.id, config: ref.config }, { events, decisions })
    const d = r.data as { population: number; completed: number; open: number; slowestMin: number }
    const unaccompanied = run.students.filter((s) => s.unaccompanied).length
    expect(d.population).toBe(run.students.length - unaccompanied)
    expect(d.completed).toBe(verified.length)
    expect(d.open).toBe(run.students.filter((s) => s.exception).length)
    expect(d.slowestMin).toBeCloseTo(Math.max(...verified.map((s) => s.releaseReadyMin!)), 1)
  })

  it('does not count a release that was not verified', async () => {
    const ref = reun.metrics.find((m) => /student/.test(m.label ?? ''))!
    const events = await eventsOf('reunion', ref.groundTruth!)
    const activated = events.find((e) => e.kind === 'site_activated')!
    const s = events.find((e) => e.kind === 'student' && e.attrs.unaccompanied !== true)!
    const r = runMetric(
      { id: ref.id, config: ref.config },
      {
        events,
        decisions: [
          {
            id: 'x',
            time: iso(Date.parse(activated.time) + 5 * 60_000),
            kind: 'hs_release_student',
            fields: { student: s.attrs.ref, identity_check: 'not_verified_sent_to_exceptions' },
          },
        ],
      },
    )
    expect((r.data as { completed: number }).completed).toBe(0)
  })

  it('measures displaced children located, counting only a located result', async () => {
    const ref = reun.metrics.find((m) => /child/.test(m.label ?? ''))!
    const events = await eventsOf('displaced', ref.groundTruth!)
    const start = events.find((e) => e.kind === 'plan_activated')!
    const run = runDisplaced({ seed: 1 })
    const locatable = run.children.filter((c) => c.locatedHour !== undefined)
    const decisions = locatable.map((c, i) => ({
      id: `l${i}`,
      time: iso(Date.parse(start.time) + c.locatedHour! * 3_600_000),
      kind: 'hs_locate_displaced_child',
      fields: { child: c.code, result: 'located_and_safe' },
    }))
    const r = runMetric({ id: ref.id, config: ref.config }, { events, decisions })
    const d = r.data as { population: number; completed: number; open: number }
    expect(d.population).toBe(run.children.length)
    expect(d.completed).toBe(locatable.length)
    expect(d.open).toBe(run.children.length - locatable.length)
    const notLocated = runMetric(
      { id: ref.id, config: ref.config },
      {
        events,
        decisions: decisions.map((x) => ({ ...x, fields: { ...x.fields, result: 'not_found' } })),
      },
    )
    expect((notLocated.data as { completed: number }).completed).toBe(0)
  })
})
