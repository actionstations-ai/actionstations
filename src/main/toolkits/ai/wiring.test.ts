// The AI incidents toolkit on the shared wiring (spec 0448, spec 0467): its decision forms are
// valid live forms with the option ids the metrics read, and every capability it names has code.
import { mkdtempSync, readFileSync } from 'node:fs'
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
const { unknownCapabilityWarnings } = await import('../capabilities')
const { fieldLintIssues, fieldLintRuleIds } = await import('../lint-rules')
const { registerAiIncidentsToolkit } = await import('./register')
const { runGenerator, generatorIds } = await import('../../case-data/generators')
const { caseDir } = await import('../../case-data/store')
const { readGroundTruth } = await import('../../evaluation/metrics/inputs')
const { runMetric } = await import('../../evaluation/metrics/registry')

const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/ai_incidents.json'), 'utf8')),
)
registerAiIncidentsToolkit()
registerAiIncidentsToolkit()

const SPEC_DECISIONS = [
  'ai_hold_release_payment',
  'ai_verify_callback',
  'ai_declare_incident',
  'ai_classify_serious_incident',
  'ai_pause_feature',
  'ai_preserve_evidence',
  'ai_notify_regulator',
  'ai_notify_customers',
  'ai_notify_bank_law_enforcement',
  'ai_issue_statement',
  'ai_request_takedown',
  'ai_notify_vendor',
]

describe('decision forms in live play and Facilitate', () => {
  const forms = liveFormsOf([toolkit])

  it('has a form for every decision the spec lists (FR-7)', () => {
    expect(toolkit.decisionForms.map((f) => f.id)).toEqual(SPEC_DECISIONS)
  })

  it('converts every form to a valid live form with its id as the kind', () => {
    expect(forms).toHaveLength(toolkit.decisionForms.length)
    for (const f of forms) {
      const parsed = DecisionForm.safeParse(f)
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
    }
  })

  it('time-stamps every decision with a required time field', () => {
    for (const f of forms.map((x) => DecisionForm.parse(x))) {
      const time = f.fields.find((x) => x.id === 'time')
      expect(time?.type, f.id).toBe('time')
      expect(time?.required, f.id).toBe(true)
    }
  })

  it('offers the options the metrics read: hold, release, the callback results, the classification', () => {
    const options = (formId: string, fieldId: string): string[] => {
      const form = DecisionForm.parse(forms.find((f) => (f as { id: string }).id === formId))
      const field = form.fields.find((x) => x.id === fieldId)
      return field?.type === 'choice' ? field.options.map((o) => o.id) : []
    }
    expect(options('ai_hold_release_payment', 'action')).toEqual(['hold', 'release'])
    expect(options('ai_verify_callback', 'result')).toEqual([
      'confirmed_genuine',
      'not_genuine',
      'could_not_reach',
    ])
    expect(options('ai_classify_serious_incident', 'classification')).toEqual([
      'yes',
      'no',
      'undecided',
    ])
    expect(options('ai_pause_feature', 'evidence_first')).toEqual(['yes', 'no'])
  })
})

describe('code the toolkit names exists', () => {
  it('has no figure kind, connector, metric or lint rule the app lacks', () => {
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })
})

describe('code the toolkit names, registered', () => {
  it('has the generators and lint rules registered once', () => {
    expect(generatorIds()).toEqual(
      expect.arrayContaining(['ai-synthetic-fraud', 'ai-model-incident']),
    )
    expect(fieldLintRuleIds()).toEqual(expect.arrayContaining(toolkit.lintRules))
  })
})

describe('field lint rules', () => {
  const notice = (over: Record<string, unknown> = {}) => ({
    authority: 'Market Surveillance Authority of Northmark',
    reportType: 'Initial report (incomplete)',
    system: { name: 'Harbor Assist' },
    awarenessDate: 'November 3, 2026',
    harm: 'Eleven customers delayed a required step.',
    causalLink: { assessment: 'Reasonably likely', basis: 'Logs show the advice.' },
    status: 'Investigation open',
    clockStated: '15 days after awareness',
    ...over,
  })

  it('accepts a complete serious incident draft with a known clock', () => {
    expect(fieldLintIssues('serious_incident_notice', notice())).toEqual([])
  })

  it('flags a draft that leaves out the date of awareness or the causal link', () => {
    const issues = fieldLintIssues(
      'serious_incident_notice',
      notice({ awarenessDate: '', causalLink: { assessment: 'Established', basis: '' } }),
    )
    expect(issues.map((i) => i.path)).toEqual(['fields.awarenessDate', 'fields.causalLink.basis'])
  })

  it('flags a stated clock the scenario does not have, and accepts the known ones', () => {
    expect(
      fieldLintIssues('serious_incident_notice', notice({ clockStated: '30 days' })),
    ).toHaveLength(1)
    for (const ok of ['2 days after awareness', 'not later than 10 days', 'four business days'])
      expect(fieldLintIssues('serious_incident_notice', notice({ clockStated: ok }))).toEqual([])
  })

  it('flags an account number that could be real and accepts a TEST value', () => {
    const recall = (account: string) => ({
      company: { name: 'Redfern Logistics', account },
      payments: [{ account: 'TEST-77310045' }, { account: '021000021' }],
    })
    const issues = fieldLintIssues('payment_recall_request', recall('TEST-20481177'))
    expect(issues.map((i) => i.path)).toEqual(['fields.payments[1].account'])
    expect(fieldLintIssues('payment_recall_request', recall('4111 1111 1111 1111'))).toHaveLength(2)
  })

  it('reports nothing when the structured field is absent', () => {
    expect(fieldLintIssues('payment_recall_request', {})).toEqual([])
    expect(fieldLintIssues('serious_incident_notice', {})).not.toEqual([])
  })
})

describe('metrics read what the simulators write', () => {
  const ref = (id: string) => toolkit.metrics.find((m) => m.id === id)!
  const generated = async (id: string, params: Record<string, unknown> = {}) => {
    const root = mkdtempSync(join(tmpdir(), 'ttx-ai-wire-'))
    const m = await runGenerator(root, 's', id, params, { maxMbPerScenario: 500 })
    return { m, root }
  }

  it('writes the ground-truth datasets the toolkit metrics name, labeled simulated', async () => {
    const fraud = await generated('ai-synthetic-fraud')
    const model = await generated('ai-model-incident')
    for (const m of toolkit.metrics.filter((x) => x.groundTruth && x.id.startsWith('ai_'))) {
      const manifest = m.groundTruth === 'ai-fraud-events' ? fraud.m : model.m
      expect(
        manifest.datasets.map((d) => d.id),
        m.id,
      ).toContain(m.groundTruth)
    }
    for (const d of [...fraud.m.datasets, ...model.m.datasets]) {
      expect(d.label.toLowerCase(), d.id).toContain('simulated')
      expect(d.provenance.origin).toBe('simulated')
    }
  })

  it('scores a hold between settlements: one payment held, two settled with a recall request', async () => {
    const { m, root } = await generated('ai-synthetic-fraud')
    const ds = m.datasets.find((d) => d.id === ref('ai_payments_stopped').groundTruth)!
    const events = await readGroundTruth(caseDir(root, 's'), ds.file!)
    const attempts = events.filter((e) => e.kind === 'ai_payment_attempt')
    expect(attempts).toHaveLength(3)
    const settle = attempts.map((a) => Date.parse(a.attrs.settleAt as string))
    const holdAt = new Date((settle[1]! + settle[2]!) / 2).toISOString()
    const r = runMetric(
      { id: 'ai_payments_stopped', config: ref('ai_payments_stopped').config },
      {
        events,
        decisions: [
          {
            id: 'd1',
            time: holdAt,
            kind: 'ai_notify_bank_law_enforcement',
            fields: { request: 'recall_request', recipient: 'originating_bank' },
          },
        ],
      },
    )
    const data = r.data as {
      heldCount: number
      attemptedCount: number
      outcomes: Record<string, string>
    }
    expect(data.attemptedCount).toBe(3)
    expect(data.heldCount).toBe(1)
    expect(
      Object.values(data.outcomes).filter((o) => o === 'settled, recall requested'),
    ).toHaveLength(2)
  })

  it('has no clock for a victim of fraud and a regulator clock for a provider', async () => {
    const victim = await generated('ai-model-incident', { role: 'victim' })
    const provider = await generated('ai-model-incident', { role: 'provider' })
    const read = async (g: { m: typeof victim.m; root: string }) =>
      readGroundTruth(
        caseDir(g.root, 's'),
        g.m.datasets.find((d) => d.id === 'ai-incident-events')!.file!,
      )
    const clocks = async (g: typeof victim) =>
      (await read(g)).filter((e) => e.kind === 'ai_disclosure_due').map((e) => e.attrs.recipient)
    expect(await clocks(victim)).toEqual(['customers'])
    expect(await clocks(provider)).toEqual(['customers', 'regulator'])
  })
})
