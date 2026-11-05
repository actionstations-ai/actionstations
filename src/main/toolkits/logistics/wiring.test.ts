// The logistics toolkit on the shared wiring (spec 0448, spec 0462): its decision forms are valid
// live forms, its lint rules run on injects, and nothing it names is missing code.
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
const { liveFormsOf } = await import('../decision-forms')
const { fieldLintIssues, fieldLintRuleIds } = await import('../lint-rules')
const { unknownCapabilityWarnings } = await import('../capabilities')

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
