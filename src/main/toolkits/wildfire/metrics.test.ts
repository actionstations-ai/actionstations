// The wildfire decisions and metrics (spec 0461 FR-12, FR-13): each form converts to a valid live
// form, and each metric the toolkit names reads the datasets the simulators write.
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
const { DecisionForm: LiveDecisionForm } = await import('@shared/schemas/decisions')
const { liveFormsOf } = await import('../decision-forms')
const { unknownCapabilityWarnings } = await import('../capabilities')
const { runGenerator } = await import('../../case-data/generators')
const { caseDir } = await import('../../case-data/store')
const { readGroundTruth, readModeledSeries } = await import('../../evaluation/metrics/inputs')
const { runMetric } = await import('../../evaluation/metrics/registry')
const { registerWildfireToolkit } = await import('./register')
const { SAMPLE_FIRE, SAMPLE_SHUTOFF } = await import('./samples')

const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/wildfire.json'), 'utf8')),
)
registerWildfireToolkit()
registerWildfireToolkit()

const MIN = 60_000
const metric = (id: string, label: RegExp) =>
  toolkit.metrics.find((m) => m.id === id && label.test(m.label ?? ''))!

describe('decision forms', () => {
  it('convert to live forms that pass the live schema', () => {
    const forms = liveFormsOf([toolkit]).map((f) => LiveDecisionForm.parse(f))
    expect(forms.map((f) => f.id)).toEqual(toolkit.decisionForms.map((f) => f.id))
  })
  it('prefix every form id with the field and offer a drawable zone on the evacuation forms', () => {
    for (const f of toolkit.decisionForms) expect(f.id).toMatch(/^wildfire_/)
    const forms = liveFormsOf([toolkit]).map((f) => LiveDecisionForm.parse(f))
    const order = forms.find((f) => f.id === 'wildfire_evacuation_order')!
    expect(order.fields.find((x) => x.type === 'area')).toMatchObject({ draw: true })
  })
  it('has a form for every decision the metrics read', () => {
    const ids = toolkit.decisionForms.map((f) => f.id)
    for (const m of toolkit.metrics) {
      const kind = m.config.actionKind
      if (typeof kind === 'string') expect(ids).toContain(kind)
    }
    for (const id of [
      'wildfire_send_shutoff_notice',
      'wildfire_contact_medical_baseline',
      'wildfire_notify_critical_facility',
    ])
      expect(ids).toContain(id)
  })
  it('names every metric and series the generators write', () => {
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })
})

describe('metrics read what the simulators write', () => {
  it('scores an evacuation order against arrival less clearance time per zone', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ttx-wildfire-'))
    const m = await runGenerator(
      root,
      's',
      'wildfire-event',
      { ...SAMPLE_FIRE },
      { maxMbPerScenario: 500 },
    )
    const ref = metric('threshold_timing', /Evacuation order/)
    const ds = m.datasets.find((d) => d.id === ref.series)!
    const series = await readModeledSeries(caseDir(root, 's'), ds.file!)
    const truth = await readGroundTruth(
      caseDir(root, 's'),
      m.datasets.find((d) => d.id === 'sim-fire-arrivals')!.file!,
    )
    const c3 = truth.find((e) => e.kind === 'fire_arrival' && e.area === 'C-3')!
    const latest = Date.parse(String(c3.attrs.latestOrderTime))
    const run = (offsetMin: number) =>
      runMetric(
        { id: ref.id, config: ref.config },
        {
          series,
          decisions: [
            {
              id: 'd',
              time: new Date(latest + offsetMin * MIN).toISOString(),
              kind: 'wildfire_evacuation_order',
              area: 'C-3',
              fields: {},
            },
          ],
        },
      )
    const zones = (r: ReturnType<typeof run>) =>
      (r.data as { zones: Record<string, { status: string }> }).zones
    expect(zones(run(-20))['C-3']!.status).toBe('on_time')
    expect(zones(run(20))['C-3']!.status).toBe('late')
    expect(zones(run(-20))['N-1']!.status).toBe('no_crossing')
  })

  it('scores a school action when the AQI crosses 150', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ttx-wildfire-'))
    const m = await runGenerator(
      root,
      's',
      'wildfire-event',
      { ...SAMPLE_FIRE },
      { maxMbPerScenario: 500 },
    )
    const ref = metric('threshold_timing', /School or facility/)
    const series = await readModeledSeries(
      caseDir(root, 's'),
      m.datasets.find((d) => d.id === ref.series)!.file!,
    )
    const r = runMetric(
      { id: ref.id, config: ref.config },
      {
        series,
        decisions: [
          {
            id: 'd',
            time: '2026-09-12T18:42:00Z',
            kind: 'wildfire_close_school_or_facility',
            area: 'Calloway Falls Elementary',
            fields: {},
          },
        ],
      },
    )
    const zones = (r.data as { zones: Record<string, { status: string }> }).zones
    expect(zones['Calloway Falls Elementary']!.status).toBe('on_time')
    expect(zones['Calloway Regional Hospital']!.status).toBe('no_action')
  })

  it('scores shutoff notices against the four windows and counts customers reached', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ttx-wildfire-'))
    const m = await runGenerator(
      root,
      's',
      'wildfire-shutoff-event',
      { ...SAMPLE_SHUTOFF },
      { maxMbPerScenario: 500 },
    )
    const windows = await readGroundTruth(
      caseDir(root, 's'),
      m.datasets.find((d) => d.id === 'sim-psps-windows')!.file!,
    )
    const circuits = await readGroundTruth(
      caseDir(root, 's'),
      m.datasets.find((d) => d.id === 'sim-psps-circuits')!.file!,
    )
    const win = (label: string) => windows.find((w) => w.attrs.label === label)!
    const mid = (label: string) =>
      new Date(
        (Date.parse(String(win(label).attrs.earliest)) +
          Date.parse(String(win(label).attrs.latest))) /
          2,
      ).toISOString()
    const notice = (id: string, time: string, audience: string) => ({
      id,
      time,
      kind: 'wildfire_send_shutoff_notice',
      fields: { audience, channel: 'text' },
    })
    const ref = metric('wildfire_notification_windows', /inside their windows/)
    const r = runMetric(
      { id: ref.id, config: ref.config },
      {
        events: windows,
        decisions: [
          notice('a', mid('48-72 hours before'), 'public_safety_partners'),
          // A customer notice sent 60 hours ahead is outside the 24-48 hour window.
          notice('b', mid('48-72 hours before'), 'customers'),
          notice('c', mid('At de-energization'), 'customers'),
        ],
      },
    )
    const result = (r.data as { windows: Record<string, string> }).windows
    expect(result['48-72 hours before']).toBe('Met')
    expect(result['24-48 hours before']).toBe('Missed')
    expect(result['1-4 hours before']).toBe('Missed')
    expect(result['At de-energization']).toBe('Met')

    const reach = metric('wildfire_customer_reach', /Medical baseline/)
    const first = circuits.find((e) => e.kind === 'medical_baseline_group')!
    const total = Number(first.attrs.customers)
    const out = runMetric(
      { id: reach.id, config: reach.config },
      {
        events: circuits,
        decisions: [
          {
            id: 'x',
            time: first.time,
            kind: 'wildfire_contact_medical_baseline',
            area: first.area,
            fields: { attempts: total + 5, contacts: total + 5 },
          },
        ],
      },
    )
    const d = out.data as { reached: number; attempts: number; customers: number }
    expect(d.reached).toBe(total)
    expect(d.attempts).toBe(total + 5)
    expect(d.customers).toBeGreaterThan(total)
  })
})
