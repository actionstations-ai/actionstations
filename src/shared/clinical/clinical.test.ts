// HL7 v2 and FHIR checks, the synthetic patient generator and the message_view template sample
// (spec 0451 FR-4, FR-5, FR-9). Samples here are fictional.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateFhir } from './fhir'
import { decodeHl7, decodedMismatches, hl7Field, parseHl7, validateHl7 } from './hl7v2'
import { LAB_RANGES, flagFor, labRange } from './reference'
import {
  SYNTHETIC_FAMILY_NAME,
  generatePatient,
  generatePatients,
  patientIssues,
} from './synthetic'

const ORU = [
  'MSH|^~\\&|LIS|RIVERBEND|EHR|RIVERBEND|20261021134500||ORU^R01|MSG00019421|P|2.5.1',
  'PID|1||00482913^^^RIVERBEND^MR||TESTPATIENT^Alder||19510314|M',
  'OBR|1|ORD55120|LAB77031|2823-3^Potassium^LN|||20261021133900',
  'OBX|1|NM|2823-3^Potassium^LN||6.3|mmol/L|3.5-5.1|HH|||F',
].join('\r')

describe('HL7 v2 checks', () => {
  it('accepts a well-formed ORU^R01', () => {
    expect(validateHl7(ORU)).toEqual([])
  })

  it('reads fields by position, with MSH-1 as the separator', () => {
    const segs = parseHl7(ORU)
    expect(hl7Field(segs, 'MSH', 9)).toBe('ORU^R01')
    expect(hl7Field(segs, 'MSH', 10)).toBe('MSG00019421')
    expect(hl7Field(segs, 'PID', 5)).toBe('TESTPATIENT^Alder')
    expect(hl7Field(segs, 'OBX', 5)).toBe('6.3')
  })

  it('reports a missing required segment', () => {
    const noObx = ORU.split('\r').slice(0, 3).join('\r')
    expect(validateHl7(noObx).map((i) => i.message)).toContain('ORU^R01 needs a OBX segment')
  })

  it('reports bad separators, version, timestamp, sex and numeric value', () => {
    const bad = ORU.replace('^~\\&', '^~&&')
      .replace('2.5.1', 'five')
      .replace('20261021134500', '2026-10-21')
      .replace('|19510314|M', '|19510314|X')
      .replace('|6.3|', '|six|')
    const text = validateHl7(bad)
      .map((i) => i.message)
      .join('\n')
    expect(text).toMatch(/MSH-2/)
    expect(text).toMatch(/MSH-12/)
    expect(text).toMatch(/MSH-7/)
    expect(text).toMatch(/PID-8/)
    expect(text).toMatch(/typed NM/)
  })

  it('rejects text that does not start with MSH and unknown message types', () => {
    expect(validateHl7('PID|1')).toHaveLength(1)
    expect(
      validateHl7(ORU.replace('ORU^R01', 'ZZZ^Z99')).some((i) => /MSH-9/.test(i.message)),
    ).toBe(true)
  })

  it('decodes fields and detects a decoded value that differs from the raw text', () => {
    const rows = decodeHl7(ORU)
    expect(rows.find((r) => r.field === 'OBX-8')?.value).toBe('HH')
    expect(decodedMismatches(ORU, rows)).toEqual([])
    const wrong = rows.map((r) => (r.field === 'PID-8' ? { ...r, value: 'F' } : r))
    expect(decodedMismatches(ORU, wrong)).toEqual(['PID-8 shows "F" but the message has "M"'])
    expect(decodedMismatches(ORU, wrong, ['PID-8'])).toEqual([])
  })
})

describe('FHIR shape checks', () => {
  const observation = {
    resourceType: 'Observation',
    id: 'obs-1',
    status: 'final',
    code: { text: 'Potassium' },
    subject: { reference: 'Patient/pt-1' },
    effectiveDateTime: '2026-10-21T13:39:00',
  }

  it('accepts a valid Observation and Patient', () => {
    expect(validateFhir(observation)).toEqual([])
    expect(
      validateFhir({
        resourceType: 'Patient',
        id: 'pt-1',
        gender: 'male',
        birthDate: '1951-03-14',
      }),
    ).toEqual([])
  })

  it('reports a missing status, a bad status, a bad date and a bad reference', () => {
    const { status: _status, ...noStatus } = observation
    expect(validateFhir(noStatus).map((i) => i.path)).toContain('status')
    expect(validateFhir({ ...observation, status: 'done' })[0]?.message).toMatch(/value set/)
    expect(validateFhir({ ...observation, effectiveDateTime: '21/10/2026' })[0]?.path).toBe(
      'effectiveDateTime',
    )
    expect(validateFhir({ ...observation, subject: { reference: 'pt-1' } })[0]?.path).toBe(
      'subject.reference',
    )
  })

  it('needs intent and medication on a MedicationRequest', () => {
    const paths = validateFhir({
      resourceType: 'MedicationRequest',
      id: 'm1',
      status: 'active',
      subject: { reference: 'Patient/p' },
    }).map((i) => i.path)
    expect(paths).toEqual(expect.arrayContaining(['intent', 'medication[x]']))
  })

  it('refuses unknown resource types and non-JSON text', () => {
    expect(validateFhir({ resourceType: 'Banana', id: 'x' })[0]?.path).toBe('resourceType')
    expect(validateFhir('{nope')[0]?.message).toBe('not valid JSON')
  })
})

describe('reference ranges', () => {
  it('flags values against range and critical limits', () => {
    const k = labRange('potassium')
    expect(flagFor(k, 4.2)).toBe('')
    expect(flagFor(k, 5.6)).toBe('abnormal')
    expect(flagFor(k, 6.3)).toBe('critical')
    expect(LAB_RANGES.every((r) => r.low < r.high)).toBe(true)
  })
})

describe('synthetic patients', () => {
  const asOf = '2026-10-21'

  it('is deterministic for a seed and differs across seeds', () => {
    expect(generatePatients(7, 5, { asOf })).toEqual(generatePatients(7, 5, { asOf }))
    expect(generatePatient(7, 0, { asOf })).not.toEqual(generatePatient(8, 0, { asOf }))
  })

  it('makes fictional, internally consistent patients', () => {
    for (const p of generatePatients(42, 60, { asOf })) {
      expect(p.family).toBe(SYNTHETIC_FAMILY_NAME)
      expect(patientIssues(p, asOf), `${p.given}`).toEqual([])
      expect(p.mrn).toMatch(/^\d{8}$/)
      expect(p.medications.length).toBeGreaterThan(0)
    }
  })

  it('never gives a drug of an allergy class the patient reports', () => {
    for (const p of generatePatients(3, 200, { asOf }))
      for (const m of p.medications)
        expect(m.allergyClass && p.allergies.includes(m.allergyClass)).toBeFalsy()
  })

  it('pushes labs the way the diagnosis implies and flags them', () => {
    const hf = generatePatients(11, 200, { asOf }).filter((p) =>
      p.diagnoses.includes('Type 2 diabetes mellitus'),
    )
    expect(hf.length).toBeGreaterThan(0)
    for (const p of hf) expect(p.results.find((r) => r.labId === 'glucose')?.flag).not.toBe('')
  })

  it('uses a record number format from the scenario', () => {
    const p = generatePatient(1, 0, { asOf, mrn: { prefix: 'RB', digits: 6 } })
    expect(p.mrn).toMatch(/^RB\d{6}$/)
  })
})

describe('message_view sample', () => {
  const preview = JSON.parse(
    readFileSync(
      join(__dirname, '..', '..', '..', 'templates', 'injects', 'message_view', 'preview.json'),
      'utf8',
    ),
  ) as { fields: Record<string, unknown>; variants: { fhir: { fields: Record<string, unknown> } } }

  it('shows a valid HL7 v2 message whose decoded table matches the raw text', () => {
    const raw = String(preview.fields.raw)
    expect(validateHl7(raw)).toEqual([])
    expect(decodedMismatches(raw, preview.fields.decoded as never)).toEqual([])
  })

  it('shows a valid FHIR resource whose decoded table matches the raw JSON', () => {
    const raw = String(preview.variants.fhir.fields.raw)
    expect(validateFhir(raw)).toEqual([])
    const resource = JSON.parse(raw) as Record<string, unknown>
    const at = (path: string): unknown =>
      path
        .split('.')
        .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], resource)
    for (const row of preview.variants.fhir.fields.decoded as { field: string; value: string }[])
      expect(String(at(row.field)), row.field).toBe(row.value)
  })
})
