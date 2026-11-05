// The clinical systems format rules through the field lint registry (spec 0451 FR-5).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fieldLintIssues, fieldLintRuleIds } from '../lint-rules'

interface Preview {
  fields: Record<string, unknown>
  variants: { fhir: { fields: Record<string, unknown> } }
}
const preview = JSON.parse(
  readFileSync(
    join(__dirname, '..', '..', '..', '..', 'templates', 'injects', 'message_view', 'preview.json'),
    'utf8',
  ),
) as Preview
const hl7 = preview.fields
const fhir = { ...preview.fields, ...preview.variants.fhir.fields }

describe('clinical systems lint rules', () => {
  it('registers both rule ids the toolkit names', () => {
    expect(fieldLintRuleIds()).toEqual(expect.arrayContaining(['hl7v2_syntax', 'fhir_shape']))
  })

  it('finds nothing wrong with the template samples', () => {
    expect(fieldLintIssues('message_view', hl7)).toEqual([])
    expect(fieldLintIssues('message_view', fhir)).toEqual([])
  })

  it('reports a broken HL7 message and a decoded value that differs from the raw text', () => {
    const broken = { ...hl7, raw: String(hl7.raw).replace('ORU^R01', 'ZZZ^Z99') }
    expect(fieldLintIssues('message_view', broken).some((i) => /MSH-9/.test(i.message))).toBe(true)
    const wrongDecoded = {
      ...hl7,
      decoded: (hl7.decoded as { field: string; value: string }[]).map((r) =>
        r.field === 'OBX-5' ? { ...r, value: '4.1' } : r,
      ),
    }
    expect(fieldLintIssues('message_view', wrongDecoded)[0]?.message).toMatch(/OBX-5 shows "4.1"/)
  })

  it('reports a FHIR resource missing a required element or disagreeing with its table', () => {
    const noStatus = { ...fhir, raw: String(fhir.raw).replace('"status": "final",', '') }
    expect(fieldLintIssues('message_view', noStatus).map((i) => i.message)).toContain(
      'status: status is required',
    )
    const wrongDecoded = {
      ...fhir,
      decoded: (fhir.decoded as { field: string; value: string }[]).map((r) =>
        r.field === 'valueQuantity.value' ? { ...r, value: '9.9' } : r,
      ),
    }
    expect(fieldLintIssues('message_view', wrongDecoded)[0]?.message).toMatch(
      /valueQuantity.value shows "9.9"/,
    )
  })

  it('leaves other inject types and the other format alone', () => {
    expect(fieldLintIssues('tweet', hl7)).toEqual([])
    // An HL7 sample labeled FHIR is a FHIR problem, never an HL7 one.
    const issues = fieldLintIssues('message_view', { ...hl7, format: 'fhir' })
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.every((i) => !/^MSH/.test(i.message))).toBe(true)
  })
})
