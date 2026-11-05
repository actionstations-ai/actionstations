// The governance toolkit on the shared registries: every id it names has code behind it, its
// decision forms convert to valid live forms, its format rules run through the field lint
// registry, and its metrics read the datasets the simulator writes and the decisions the forms
// record.
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
const { registerGovernanceToolkit } = await import('./register')
const { runGenerator } = await import('../../case-data/generators')
const { caseDir } = await import('../../case-data/store')
const { readGroundTruth } = await import('../../evaluation/metrics/inputs')
const { metricRefFromToolkit, runMetric } = await import('../../evaluation/metrics/registry')
const { liveFormsOf } = await import('../decision-forms')
const { DecisionForm: LiveDecisionForm } = await import('@shared/schemas/decisions')

const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/governance.json'), 'utf8')),
)
registerGovernanceToolkit()
registerGovernanceToolkit()

describe('capabilities', () => {
  it('has code behind every figure kind, connector, metric and lint rule the toolkit names', () => {
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })
})

describe('decision forms', () => {
  const forms = liveFormsOf([toolkit]).map((f) => LiveDecisionForm.parse(f))
  it('convert to live forms that pass the live schema', () => {
    expect(forms.map((f) => f.id)).toEqual(toolkit.decisionForms.map((f) => f.id))
    expect(forms).toHaveLength(7)
  })
  it('use the option ids the metrics read', () => {
    const options = (formId: string, fieldId: string): string[] => {
      const field = forms.find((f) => f.id === formId)!.fields.find((x) => x.id === fieldId)!
      return field.type === 'choice' ? field.options.map((o) => o.id) : []
    }
    expect(options('gov_materiality_determination', 'determination')).toEqual([
      'material',
      'not_material',
      'not_yet_determined',
    ])
    expect(options('gov_disclosure_decision', 'item')).toEqual([
      'item_1_05',
      'item_8_01',
      'no_filing_yet',
    ])
  })
  it('ask for the owner, the facts known and the basis on every form', () => {
    for (const f of forms)
      for (const id of ['decided_by', 'information_known', 'basis'])
        expect(f.fields.find((x) => x.id === id)?.required, `${f.id} ${id}`).toBe(true)
  })
})

describe('lint rules', () => {
  it('flags a draft that breaks the rules and accepts a correct one', () => {
    const bad = { item: '8.01', headline: 'Material Cybersecurity Incidents', nature: 'x' }
    expect(fieldLintIssues('gov_disclosure_draft', bad).length).toBeGreaterThanOrEqual(2)
  })
})

describe('metrics read what the simulator writes', () => {
  const metric = (id: string) => {
    const m = toolkit.metrics.find((x) => x.id === id)!
    return {
      ref: metricRefFromToolkit({
        id: m.id,
        config: m.config as Record<string, string | number | boolean>,
      }),
      dataset: m.groundTruth,
    }
  }
  it('scores recovery against the dataset the toolkit metric names', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gov-wire-'))
    await runGenerator(root, 's1', 'governance-incident', {}, { maxMbPerScenario: 50 })
    const { ref, dataset } = metric('gov_recovery_rto')
    const events = await readGroundTruth(caseDir(root, 's1'), `${dataset}.geojson`)
    const out = runMetric(ref, { events })
    expect(out.summary[0]!.value).toMatch(/of 6$/)
    expect(Number(out.data!.functions)).toBe(6)
  })
  it('times disclosure from the discovery event and the recorded decisions', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gov-wire-'))
    await runGenerator(root, 's2', 'governance-incident', {}, { maxMbPerScenario: 50 })
    const { ref, dataset } = metric('gov_disclosure_timing')
    const events = await readGroundTruth(caseDir(root, 's2'), `${dataset}.geojson`)
    const out = runMetric(ref, {
      events,
      decisions: [
        {
          id: 'd1',
          time: '2026-10-23T10:05:00.000Z',
          kind: 'gov_materiality_determination',
          fields: { determination: 'material' },
        },
      ],
    })
    expect(out.summary.find((s) => s.label === 'Discovery to determination')!.value).toBe('22.8 h')
  })
  it('runs decision documentation and message consistency with the toolkit configuration', () => {
    const doc = metric('gov_decision_documentation')
    expect(runMetric(doc.ref, { decisions: [] }).metricId).toBe('gov_decision_documentation')
    const consistency = metric('message_consistency')
    const out = runMetric(consistency.ref, {
      facts: [{ id: 'records', label: 'Records affected' }],
      statements: [
        { factId: 'records', partner: 'Form 8-K', value: '12000' },
        { factId: 'records', partner: 'Press release', value: '12000' },
      ],
    })
    expect(out.metricId).toBe('message_consistency')
  })
})

describe('capabilities of the exercise', () => {
  it('lists the six core capabilities with critical tasks', () => {
    expect(toolkit.capabilities.map((c) => c.coreCapability).sort()).toEqual([
      'economic_recovery',
      'operational_communications',
      'operational_coordination',
      'planning',
      'public_information_and_warning',
      'situational_assessment',
    ])
    for (const c of toolkit.capabilities) expect(c.criticalTasks.length).toBeGreaterThan(0)
  })
})
