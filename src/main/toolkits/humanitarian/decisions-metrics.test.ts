// The humanitarian decision forms and metric configurations (spec 0469 FR-11..FR-13), run on the
// simulated data they were written for: forms are valid live forms, each configuration is a
// valid input to the real metric, and the worked examples score as a reader would expect.
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
const { readGroundTruth, readModeledSeries, decisionsFromLog } =
  await import('../../evaluation/metrics/inputs')
const { runMetric } = await import('../../evaluation/metrics/registry')
const { registerHumanitarianToolkit } = await import('./register')
const { HUMANITARIAN_GENERATORS } = await import('./simulate')
const { CORE_CAPABILITIES } = await import('@shared/core-capabilities')

registerHumanitarianToolkit()
const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/humanitarian.json'), 'utf8')),
)

function written(generatorId: string, params: unknown = {}): string {
  const g = HUMANITARIAN_GENERATORS.find((x) => x.id === generatorId)! as unknown as {
    params: { parse(p: unknown): unknown }
    generate(p: unknown): { id: string; data: unknown }[]
  }
  const dir = mkdtempSync(join(tmpdir(), 'hum-'))
  mkdirSync(dir, { recursive: true })
  for (const d of g.generate(g.params.parse(params)))
    writeFileSync(join(dir, `${d.id}.json`), JSON.stringify(d.data))
  return dir
}

const decide = (kind: string, at: string, fields: Record<string, unknown> = {}, area?: string) =>
  decisionsFromLog([
    {
      i: Math.floor(Math.random() * 1e6),
      at,
      kind: 'decision.submitted',
      data: { structured: { kind, fields, ...(area ? { area } : {}) } },
    },
  ])[0]!

describe('decision forms in live play', () => {
  const forms = liveFormsOf([toolkit])
  it('has the decisions of the spec and converts each to a valid live form', () => {
    expect(forms).toHaveLength(toolkit.decisionForms.length)
    const ids = toolkit.decisionForms.map((f) => f.id)
    for (const id of [
      'humanitarian_request_cluster_activation',
      'humanitarian_activate_cluster',
      'humanitarian_assign_gap',
      'humanitarian_escalate_gap_hct',
      'humanitarian_launch_appeal',
      'humanitarian_stop_movements',
      'humanitarian_hibernate_or_relocate',
      'humanitarian_evacuate_staff',
      'humanitarian_notify_family',
      'humanitarian_activate_crisis_management_team',
      'humanitarian_share_security_alert',
      'humanitarian_reroute_shipment',
      'humanitarian_request_customs_waiver',
      'humanitarian_declare_outbreak_response',
      'humanitarian_public_statement',
    ])
      expect(ids).toContain(id)
    for (const f of forms) {
      const parsed = DecisionForm.safeParse(f)
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
    }
  })
  it('asks for an area where the decision is about a place', () => {
    for (const id of ['humanitarian_stop_movements', 'humanitarian_hibernate_or_relocate']) {
      const form = DecisionForm.parse(forms.find((f) => (f as { id: string }).id === id))
      expect(
        form.fields.some((x) => x.id === 'area'),
        id,
      ).toBe(true)
    }
  })
})

describe('metric configurations run on their datasets', () => {
  it('every named metric exists and its config validates', () => {
    for (const m of toolkit.metrics) {
      const r = runMetric({ id: m.id, config: m.config }, {})
      expect(r.metricId, m.label).toBe(m.id)
    }
  })

  it('gap closure: assigned and covered gaps are timed, the rest are open', async () => {
    const dir = written('humanitarian-3w', { presence: 0.15 })
    const events = await readGroundTruth(dir, 'hum-gap-events.json')
    expect(events.length).toBeGreaterThan(3)
    const [a, b] = events
    const at = (e: typeof a, h: number) =>
      new Date(Date.parse(e!.time) + h * 3_600_000).toISOString()
    const decisions = [
      decide('humanitarian_assign_gap', at(a, 6), {
        gap: a!.attrs.gap,
        partner: 'Open Hands Alliance',
      }),
      decide('humanitarian_confirm_gap_covered', at(a, 30), { gap: a!.attrs.gap }),
      decide('humanitarian_assign_gap', at(b, 20), {
        gap: b!.attrs.gap,
        partner: 'Kestrel Health Aid',
      }),
    ]
    const r = runMetric({ id: 'humanitarian_gap_closure', config: {} }, { events, decisions })
    expect(r.data.gaps).toBe(events.length)
    expect(r.data.assigned).toBe(2)
    expect(r.data.assignedOnTime).toBe(1)
    expect(r.data.covered).toBe(1)
    expect(r.data.coveredOnTime).toBe(1)
    expect(r.data.open).toBe(events.length - 1)
  })

  it('needs coverage: the latest record per sector and site counts, against the entered target', () => {
    const decisions = [
      decide('humanitarian_record_coverage', '2026-10-14T10:00:00Z', {
        sector: 'Health',
        site: 'Site 1',
        target: 1000,
        reached: 200,
      }),
      decide('humanitarian_record_coverage', '2026-10-15T10:00:00Z', {
        sector: 'Health',
        site: 'Site 1',
        target: 1000,
        reached: 600,
      }),
      decide('humanitarian_record_coverage', '2026-10-15T10:00:00Z', {
        sector: 'Health',
        site: 'Site 2',
        target: 500,
        reached: 100,
      }),
    ]
    const r = runMetric(
      { id: 'humanitarian_needs_coverage', config: { minimumPercent: 50 } },
      { decisions },
    )
    expect(r.data).toMatchObject({ reached: 700, target: 1500, records: 2 })
    expect(r.data.underMinimum).toEqual(['Health / Site 2'])
  })

  it('staff safety: a movement stop after the first sign of a threat is scored against the series', async () => {
    const dir = written('humanitarian-security-threat', { onsetHours: 6 })
    const series = await readModeledSeries(dir, 'hum-threat-level.json')
    const cfg = toolkit.metrics.find((m) => m.config.actionKind === 'humanitarian_stop_movements')!
    const t0 = Date.parse(series[0]!.points[0]!.time)
    const decisions = [
      decide('humanitarian_stop_movements', new Date(t0 + 5 * 3_600_000).toISOString()),
    ]
    const r = runMetric({ id: cfg.id, config: cfg.config }, { series, decisions })
    expect(JSON.stringify(r.summary)).toMatch(/On time|on_time|1/)
    const late = [decide('humanitarian_stop_movements', new Date(t0 + 9 * 3_600_000).toISOString())]
    const r2 = runMetric({ id: cfg.id, config: cfg.config }, { series, decisions: late })
    expect(JSON.stringify(r2.tables)).toMatch(/Late/)
  })

  it('pipeline: a reroute before the break is a hit; none is a miss', async () => {
    const dir = written('humanitarian-pipeline')
    const events = await readGroundTruth(dir, 'hum-pipeline-events.json')
    const brk = events.find((e) => e.kind === 'pipeline_break')!
    const cfg = toolkit.metrics.find((m) =>
      (m.config.eventKinds as string[] | undefined)?.includes('pipeline_break'),
    )!
    const early = [
      decide(
        'humanitarian_reroute_shipment',
        new Date(Date.parse(brk.time) - 5 * 86_400_000).toISOString(),
      ),
    ]
    const hit = runMetric({ id: cfg.id, config: cfg.config }, { events, decisions: early })
    const miss = runMetric({ id: cfg.id, config: cfg.config }, { events, decisions: [] })
    expect(hit.data.hits).toBe(1)
    expect(miss.data.hits).toBe(0)
  })
})

describe('core capabilities', () => {
  it('names real Core Capability ids, with checkable tasks and the humanitarian area mapping', () => {
    const known = new Set(CORE_CAPABILITIES.map((c: { id: string }) => c.id))
    expect(toolkit.capabilities.length).toBeGreaterThanOrEqual(6)
    for (const c of toolkit.capabilities) {
      expect(known.has(c.coreCapability), c.coreCapability).toBe(true)
      expect(c.criticalTasks.length).toBeGreaterThanOrEqual(2)
      expect(c.mappings[0]!.framework).toBe('Humanitarian capability area')
    }
    const areas = new Set(toolkit.capabilities.flatMap((c) => c.mappings.flatMap((m) => m.ids)))
    for (const a of [
      'coordination',
      'assessment and information management',
      'security and duty of care',
      'logistics',
      'sector response',
      'communications and accountability to affected communities',
    ])
      expect(areas.has(a), a).toBe(true)
  })
})
