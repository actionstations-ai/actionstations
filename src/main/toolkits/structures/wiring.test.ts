// The structures toolkit on the shared wiring (spec 0448, spec 0471): its decision forms are valid
// live forms, the code it names exists, its metrics run from the generators' ground truth and
// the team's decisions, and the inspection program generator writes records, a roster, requests
// and the traps a facilitator switched on.
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))
process.env.TTX_RESOURCES = resolve('.')

const { DecisionForm } = await import('@shared/schemas/decisions')
const { ToolkitSchema } = await import('@shared/toolkits')
const { CORE_CAPABILITY_IDS } = await import('@shared/core-capabilities')
const { liveFormsOf } = await import('../decision-forms')
const { fieldLintRuleIds } = await import('../lint-rules')
const { unknownCapabilityWarnings } = await import('../capabilities')
const { registerStructuresToolkit } = await import('./register')
const { monitoringGenerator, siteEventGenerator, inspectionProgramGenerator } =
  await import('./generators')
const { MonitoringParams } = await import('./monitoring-sim')
const { ProgramParams } = await import('./program')
const { runMetric } = await import('../../evaluation/metrics/registry')
const { generatorIds } = await import('../../case-data/generators')

registerStructuresToolkit()
registerStructuresToolkit()
const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/structures.json'), 'utf8')),
)

const ids = (rows: { id: string }[]) => rows.map((r) => r.id)
const eventsOf = (d: { data: unknown }) =>
  (
    d.data as {
      events: { id: string; time: string; kind: string; attrs: Record<string, unknown> }[]
    }
  ).events

describe('decision forms in live play', () => {
  const forms = liveFormsOf([toolkit])

  it('converts every toolkit form to a valid live form with its id as the kind', () => {
    expect(forms).toHaveLength(toolkit.decisionForms.length)
    expect(forms.length).toBeGreaterThanOrEqual(11)
    for (const f of forms) {
      const parsed = DecisionForm.safeParse(f)
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
    }
  })

  it('prefixes every form id with the field so no kind collides', () => {
    for (const f of toolkit.decisionForms) expect(f.id).toMatch(/^structures_/)
  })

  it('uses the option ids the metrics read: placards and recipients', () => {
    const placard = DecisionForm.parse(
      forms.find((f) => (f as { id: string }).id === 'structures_post_placard'),
    )
    const field = placard.fields.find((f) => f.id === 'placard')
    expect(field?.type === 'choice' && field.options.map((o) => o.id)).toEqual([
      'inspected',
      'restricted_use',
      'unsafe',
    ])
    const notify = DecisionForm.parse(
      forms.find((f) => (f as { id: string }).id === 'structures_notify'),
    )
    const who = notify.fields.find((f) => f.id === 'who')
    expect(who?.type === 'choice' && who.options.map((o) => o.id)).toEqual([
      'osha',
      'owner',
      'insurer',
      'building_official',
    ])
  })

  it('puts the drawn areas on evacuation, exclusion zone and team assignment', () => {
    for (const id of [
      'structures_evacuate',
      'structures_exclusion_zone',
      'structures_assign_team',
    ]) {
      const f = DecisionForm.parse(forms.find((x) => (x as { id: string }).id === id))
      expect(
        f.fields.some((x) => x.type === 'area' && x.draw),
        id,
      ).toBe(true)
    }
  })
})

describe('code the toolkit names exists', () => {
  it('has no figure kind, connector, metric or lint rule the app lacks', () => {
    expect(fieldLintRuleIds()).toEqual(expect.arrayContaining(toolkit.lintRules))
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })

  it('has its generators registered by the shared module', () => {
    expect(generatorIds()).toEqual(
      expect.arrayContaining([
        'structures-monitoring',
        'structures-damage-states',
        'structures-site-event',
        'structures-inspection-program',
      ]),
    )
  })

  it('names core capabilities that exist', () => {
    const known = new Set<string>(CORE_CAPABILITY_IDS)
    for (const c of toolkit.capabilities)
      expect(known.has(c.coreCapability), c.coreCapability).toBe(true)
  })

  it('reads dataset ids the generators write', () => {
    const written = new Set([
      ...monitoringGenerator
        .generate(MonitoringParams.parse({ start: '2026-11-09T12:00:00Z' }))
        .map((d) => d.id),
      ...siteEventGenerator
        .generate(siteEventGenerator.params.parse({ start: '2026-11-09T12:00:00Z' }))
        .map((d) => d.id),
      ...inspectionProgramGenerator
        .generate(ProgramParams.parse({ buildingCount: 20 }))
        .map((d) => d.id),
    ])
    for (const m of toolkit.metrics) {
      if (m.groundTruth) expect(written.has(m.groundTruth), m.id).toBe(true)
      if (m.series) expect(written.has(m.series), m.id).toBe(true)
    }
  })
})

describe('metrics on generator output', () => {
  it('scores stop work against the simulated monitoring crossings and failure onset', () => {
    const out = monitoringGenerator.generate(
      MonitoringParams.parse({ start: '2026-11-09T12:00:00Z', failureOnsetHour: 3 }),
    )
    const events = eventsOf(out.find((d) => d.id === 'monitoring-truth')!)
    const alarm = events.find((e) => e.id === 'alarm-crossing')!
    const stopAt = new Date(Date.parse(alarm.time) + 7 * 60_000).toISOString()
    const result = runMetric(
      toolkit.metrics.find((m) => m.id === 'structures_warning_to_action')!,
      {
        events: events.map((e) => ({ ...e })),
        decisions: [{ id: 'd1', time: stopAt, kind: 'structures_stop_work', fields: {} }],
      },
    )
    expect(
      result.summary.find((s) => s.label.startsWith('Minutes from first sign to stop work'))?.value,
    ).toBe('7 min')
  })

  it('scores placards against the simulated building truth', () => {
    const out = inspectionProgramGenerator.generate(
      ProgramParams.parse({ buildingCount: 40, seed: 5 }),
    )
    const events = eventsOf(out.find((d) => d.id === 'inspection-truth')!)
    const truth = events.filter((e) => e.kind === 'building_truth')
    const decisions = truth.map((e, i) => ({
      id: `d${i}`,
      time: new Date(Date.parse(e.time) + (i + 1) * 60_000).toISOString(),
      kind: 'structures_post_placard',
      fields: {
        building: e.attrs.buildingId,
        placard: String(e.attrs.truthPlacard).toLowerCase().replace(/ /g, '_'),
        team: 'Team 1',
      },
    }))
    const result = runMetric(
      toolkit.metrics.find((m) => m.id === 'structures_placard_agreement')!,
      {
        events,
        decisions,
      },
    )
    expect(result.summary.find((s) => s.label.startsWith('Share in agreement'))?.value).toBe(
      '1.000',
    )
  })
})

describe('inspection program', () => {
  const run = (traps: Record<string, boolean> = {}) =>
    inspectionProgramGenerator.generate(ProgramParams.parse({ buildingCount: 60, traps }))

  it('writes records, a limited roster, requests and labeled datasets', () => {
    const out = run()
    expect(ids(out)).toEqual(
      expect.arrayContaining([
        'inspection-buildings',
        'inspection-truth',
        'inspection-records',
        'inspection-evaluators',
        'inspection-requests',
        'inspection-traps',
      ]),
    )
    for (const d of out) expect(d.label).toMatch(/simulated/)
    const roster = out.find((d) => d.id === 'inspection-evaluators')!.data as unknown[]
    expect(roster).toHaveLength(12)
    expect(roster.length).toBeLessThan(60)
    const records = (
      out.find((d) => d.id === 'inspection-records')!.data as {
        features: { properties: { conditions: { severity: string }[] } }[]
      }
    ).features
    expect(records).toHaveLength(60)
    expect(records[0]!.properties.conditions).toHaveLength(6)
  })

  it('gives a record whose findings fit the truth: red has a severe finding, green has none above minor', () => {
    const out = run()
    const truth = eventsOf(out.find((d) => d.id === 'inspection-truth')!).filter(
      (e) => e.kind === 'building_truth',
    )
    const records = (
      out.find((d) => d.id === 'inspection-records')!.data as {
        features: { properties: { id: string; conditions: { severity: string }[] } }[]
      }
    ).features
    for (const t of truth) {
      const sev = records
        .find((r) => r.properties.id === t.attrs.buildingId)!
        .properties.conditions.map((c) => c.severity)
      if (t.attrs.truthPlacard === 'UNSAFE') expect(sev).toContain('Severe')
      if (t.attrs.truthPlacard === 'INSPECTED')
        expect(sev.some((s) => s === 'Moderate' || s === 'Severe')).toBe(false)
    }
  })

  it('introduces only the traps the facilitator switched on', () => {
    const none = eventsOf(run().find((d) => d.id === 'inspection-traps')!)
    expect(none).toEqual([])
    const all = eventsOf(
      run({ conflictingPlacards: true, unsafeAdjacent: true, ownerRefuses: true }).find(
        (d) => d.id === 'inspection-traps',
      )!,
    )
    expect(all.map((e) => e.attrs.trap).sort()).toEqual([
      'conflicting_placards',
      'owner_refuses',
      'unsafe_adjacent',
    ])
  })

  it('asks for the priority buildings first and repeats for the same seed', () => {
    const a = run()
    expect(JSON.stringify(run())).toBe(JSON.stringify(a))
    const requests = a.find((d) => d.id === 'inspection-requests')!.data as { text: string }[]
    expect(requests.some((r) => /hospital|shelter|school/.test(r.text))).toBe(true)
  })
})

describe('site event', () => {
  it('writes the collapse, responders, reportable event and hazards with their clock', () => {
    const out = siteEventGenerator.generate(
      siteEventGenerator.params.parse({
        start: '2026-11-09T12:00:00Z',
        reportable: 'Work-related fatality',
      }),
    )
    const events = eventsOf(out[0]!)
    expect(events.map((e) => e.kind)).toEqual(
      expect.arrayContaining([
        'collapse',
        'first_responders_on_scene',
        'reportable_event',
        'secondary_hazard',
      ]),
    )
    expect(events.find((e) => e.kind === 'reportable_event')!.attrs.clockHours).toBe(8)
  })
})
