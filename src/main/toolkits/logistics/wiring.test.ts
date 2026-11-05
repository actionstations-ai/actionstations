// The logistics toolkit on the shared wiring (spec 0448, spec 0462): its decision forms are valid
// live forms, its lint rules run on injects, and nothing it names is missing code.
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
const { ToolkitSchema } = await import('@shared/toolkits')
const { liveFormsOf } = await import('../decision-forms')
const { fieldLintIssues, fieldLintRuleIds } = await import('../lint-rules')
const { unknownCapabilityWarnings } = await import('../capabilities')

const { registerLogisticsToolkit } = await import('./register')
const { LOGISTICS_GENERATORS } = await import('./simulate/generators')
const { readGroundTruth, readModeledSeries, decisionsFromLog } =
  await import('../../evaluation/metrics/inputs')
const { runMetric } = await import('../../evaluation/metrics/registry')
const { connectorIds } = await import('../connectors/registry')

registerLogisticsToolkit()
registerLogisticsToolkit()

const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/logistics.json'), 'utf8')),
)
const preview = (type: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(`templates/injects/${type}/preview.json`), 'utf8')).fields

describe('logistics capabilities', () => {
  it('names nothing the app has no code for', () => {
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })

  it('registers its lint rules', () => {
    for (const id of toolkit.lintRules) expect(fieldLintRuleIds()).toContain(id)
  })
})

describe('generators', () => {
  it('registers through the shared module list', async () => {
    await import('../generator-modules')
    const { generatorIds } = await import('../../case-data/generators')
    expect(generatorIds()).toEqual(expect.arrayContaining(['logistics-network', 'logistics-trace']))
  })
})

describe('registration', () => {
  it('registers the connector once, however many times it is called', () => {
    expect(connectorIds()).toContain('openfda-food-enforcement')
    expect(toolkit.connectors).toEqual(['openfda-food-enforcement'])
  })
})

describe('simulated data scored by the metrics', () => {
  const dir = mkdtempSync(join(tmpdir(), 'logistics-data-'))
  const written = (generatorId: string, params: unknown): void => {
    const g = LOGISTICS_GENERATORS.find((x) => x.id === generatorId)! as unknown as {
      params: { parse(p: unknown): unknown }
      generate(p: unknown): { id: string; data: unknown }[]
    }
    for (const d of g.generate(g.params.parse(params)))
      writeFileSync(join(dir, `${d.id}.json`), JSON.stringify(d.data))
  }
  const log = (kind: string, at: string, fields: Record<string, unknown>) => ({
    i: 1,
    at,
    kind: 'decision.submitted',
    data: { structured: { kind, fields } },
  })

  it('reads every dataset id the toolkit metrics name', async () => {
    written('logistics-network', { seed: 4 })
    written('logistics-trace', { seed: 2 })
    for (const m of toolkit.metrics) {
      if (m.groundTruth)
        expect((await readGroundTruth(dir, `${m.groundTruth}.json`)).length).toBeGreaterThan(0)
      if (m.series)
        expect((await readModeledSeries(dir, `${m.series}.json`)).length).toBeGreaterThan(0)
    }
  })

  it('runs every toolkit metric without throwing and shows its inputs', async () => {
    for (const m of toolkit.metrics) {
      const r = runMetric({ id: m.id, config: m.config }, {})
      expect(r.metricId, m.label).toBe(m.id)
    }
  })

  it('scores a trace against the simulated recall signal and answer', async () => {
    const events = await readGroundTruth(dir, 'logistics-trace-events.json')
    const signal = events.find((e) => e.kind === 'recall_signal')!
    const accounts = events.find((e) => e.kind === 'trace_answer')!.attrs.accounts as number
    const at = (min: number): string =>
      new Date(Date.parse(signal.time) + min * 60_000).toISOString()
    const decisions = decisionsFromLog([
      log('logistics_declare_recall', at(45), { recall_class: 'Class I' }),
      log('logistics_submit_trace_result', at(300), {
        consignees_found: accounts - 2,
        gaps: 'missing BOLs',
      }),
    ])
    const r = runMetric(
      { id: 'logistics_trace_completeness', config: { clockHours: 24 } },
      { events, decisions },
    )
    expect(r.summary.find((s) => s.label === 'Time to trace')!.value).toBe('300 min')
    expect(r.data.found).toBe(accounts - 2)
    const t = runMetric(
      toolkit.metrics.find((m) => m.label === 'Time from recall signal to recall decision')!,
      { events, decisions },
    )
    expect(t.metricId).toBe('decision_timing')
  })

  it('scores protective timing against the simulated days-of-supply series', async () => {
    const series = await readModeledSeries(dir, 'logistics-days-of-supply.json')
    const events = await readGroundTruth(dir, 'logistics-events.json')
    const failed = events.find((e) => e.kind === 'supplier_failed')!
    const decisions = decisionsFromLog([
      log('logistics_switch_source', failed.time, { supplier: 'Cobalt Drives' }),
    ])
    const r = runMetric(
      { id: 'logistics_supply_protection', config: { floorDays: 3 } },
      { series, decisions },
    )
    expect(r.data.critical as number).toBeGreaterThan(0)
    expect(r.data.leadDays as number).toBeGreaterThan(0)
  })
})

describe('decision forms in live play', () => {
  it('converts every form to a valid live form', () => {
    const forms = liveFormsOf([toolkit])
    expect(forms).toHaveLength(toolkit.decisionForms.length)
    for (const f of forms) {
      const parsed = DecisionForm.safeParse(f)
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
    }
  })
})

describe('lint rules on injects', () => {
  it('accept the sample recall products', () => {
    for (const t of [
      'recall_consignee_letter',
      'recall_status_report',
      'product_recall_notice',
      'temperature_excursion_alert',
      'customer_complaint_log',
      'fda_records_request_letter',
    ])
      expect(fieldLintIssues(t, preview(t)), t).toEqual([])
  })

  it('flag a Class I letter that is not urgent and has no hazard', () => {
    const f = { ...preview('recall_consignee_letter'), urgent: false, hazard: '' }
    expect(fieldLintIssues('recall_consignee_letter', f)).toHaveLength(2)
  })

  it('flag a status report whose product counts do not add up', () => {
    const f = preview('recall_status_report') as { product: Record<string, unknown> }
    const bad = { ...f, product: { ...f.product, outstanding: 1 } }
    expect(fieldLintIssues('recall_status_report', bad)).toHaveLength(1)
  })

  it('flag a lot code that changed shape across a notice', () => {
    const f = preview('product_recall_notice') as { products: Record<string, unknown>[] }
    const bad = { ...f, products: [{ ...f.products[0], lots: 'MLW-261104-A, L4411-0922' }] }
    expect(fieldLintIssues('product_recall_notice', bad)).toHaveLength(1)
  })
})
