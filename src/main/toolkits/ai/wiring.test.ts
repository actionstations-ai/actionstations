// The AI incidents toolkit on the shared wiring (spec 0448, spec 0467): its decision forms are
// valid live forms with the option ids the metrics read, and every capability it names has code.
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
const { unknownCapabilityWarnings } = await import('../capabilities')

const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/ai_incidents.json'), 'utf8')),
)

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
