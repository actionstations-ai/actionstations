// FHIR resource shape checks for the clinical systems toolkit (spec 0451 FR-5, lint rule
// `fhir_shape`). The FHIR specification is CC0, so resource shapes can be reproduced; this module
// checks the few resources the toolkit shows (Patient, Encounter, Observation, ServiceRequest,
// DiagnosticReport, MedicationRequest) for the elements and value sets the spec marks required.
// It is a shape check, not a full validator. Pure: no Node imports.

export interface FhirIssue {
  path: string
  message: string
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** FHIR date / dateTime (partial dates allowed, optional zone). */
const FHIR_DATETIME =
  /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/

const STATUS: Record<string, string[]> = {
  Encounter: [
    'planned',
    'arrived',
    'triaged',
    'in-progress',
    'onleave',
    'finished',
    'cancelled',
    'entered-in-error',
    'unknown',
  ],
  Observation: [
    'registered',
    'preliminary',
    'final',
    'amended',
    'corrected',
    'cancelled',
    'entered-in-error',
    'unknown',
  ],
  ServiceRequest: [
    'draft',
    'active',
    'on-hold',
    'revoked',
    'completed',
    'entered-in-error',
    'unknown',
  ],
  DiagnosticReport: [
    'registered',
    'partial',
    'preliminary',
    'final',
    'amended',
    'corrected',
    'appended',
    'cancelled',
    'entered-in-error',
    'unknown',
  ],
  MedicationRequest: [
    'active',
    'on-hold',
    'ended',
    'stopped',
    'completed',
    'cancelled',
    'entered-in-error',
    'draft',
    'unknown',
  ],
}

const INTENT = [
  'proposal',
  'plan',
  'directive',
  'order',
  'original-order',
  'reflex-order',
  'filler-order',
  'instance-order',
  'option',
]

export const FHIR_RESOURCE_TYPES = [
  'Patient',
  'Encounter',
  'Observation',
  'ServiceRequest',
  'DiagnosticReport',
  'MedicationRequest',
]

const needs = (r: Record<string, unknown>, key: string, issues: FhirIssue[]): void => {
  if (r[key] === undefined || r[key] === null || r[key] === '')
    issues.push({ path: key, message: `${key} is required` })
}

function checkCoded(r: Record<string, unknown>, key: string, issues: FhirIssue[]): void {
  const v = r[key]
  if (v === undefined) return
  if (!isObj(v) || (v.coding === undefined && v.text === undefined))
    issues.push({ path: key, message: `${key} must be a CodeableConcept with coding or text` })
}

function checkRef(r: Record<string, unknown>, key: string, issues: FhirIssue[]): void {
  const v = r[key]
  if (v === undefined) return
  if (
    !isObj(v) ||
    typeof v.reference !== 'string' ||
    !/^[A-Za-z]+\/[A-Za-z0-9\-.]{1,64}$/.test(v.reference)
  )
    issues.push({
      path: `${key}.reference`,
      message: `${key} must be a reference such as Patient/example`,
    })
}

function checkStatus(type: string, r: Record<string, unknown>, issues: FhirIssue[]): void {
  const allowed = STATUS[type]
  if (!allowed) return
  needs(r, 'status', issues)
  if (typeof r.status === 'string' && !allowed.includes(r.status))
    issues.push({ path: 'status', message: `status "${r.status}" is not in the ${type} value set` })
}

function checkDates(r: Record<string, unknown>, keys: string[], issues: FhirIssue[]): void {
  for (const k of keys) {
    const v = r[k]
    if (v !== undefined && (typeof v !== 'string' || !FHIR_DATETIME.test(v)))
      issues.push({ path: k, message: `${k} must be a FHIR date or dateTime` })
  }
}

function checkPatient(r: Record<string, unknown>, issues: FhirIssue[]): void {
  checkDates(r, ['birthDate'], issues)
  if (r.gender !== undefined && !['male', 'female', 'other', 'unknown'].includes(String(r.gender)))
    issues.push({ path: 'gender', message: 'gender must be male, female, other or unknown' })
  if (r.name !== undefined && !Array.isArray(r.name))
    issues.push({ path: 'name', message: 'name must be an array of HumanName' })
}

function checkByType(type: string, r: Record<string, unknown>, issues: FhirIssue[]): void {
  if (type === 'Patient') return checkPatient(r, issues)
  checkStatus(type, r, issues)
  if (type === 'Encounter') {
    needs(r, 'class', issues)
    checkRef(r, 'subject', issues)
  }
  if (type === 'Observation') {
    needs(r, 'code', issues)
    checkCoded(r, 'code', issues)
    checkRef(r, 'subject', issues)
    checkDates(r, ['effectiveDateTime', 'issued'], issues)
  }
  if (type === 'ServiceRequest' || type === 'MedicationRequest') {
    needs(r, 'intent', issues)
    needs(r, 'subject', issues)
    if (typeof r.intent === 'string' && !INTENT.includes(r.intent))
      issues.push({
        path: 'intent',
        message: `intent "${r.intent}" is not in the request intent value set`,
      })
    checkRef(r, 'subject', issues)
    checkDates(r, ['authoredOn'], issues)
    if (
      type === 'MedicationRequest' &&
      r.medicationCodeableConcept === undefined &&
      r.medicationReference === undefined
    )
      issues.push({
        path: 'medication[x]',
        message: 'MedicationRequest needs medicationCodeableConcept or medicationReference',
      })
  }
  if (type === 'DiagnosticReport') {
    needs(r, 'code', issues)
    checkCoded(r, 'code', issues)
    checkRef(r, 'subject', issues)
  }
}

/** Shape problems in a FHIR resource (object or JSON text); empty means none were found. */
export function validateFhir(input: unknown): FhirIssue[] {
  let r: unknown = input
  if (typeof input === 'string') {
    try {
      r = JSON.parse(input)
    } catch {
      return [{ path: '', message: 'not valid JSON' }]
    }
  }
  if (!isObj(r)) return [{ path: '', message: 'a resource is a JSON object' }]
  const issues: FhirIssue[] = []
  const type = r.resourceType
  if (typeof type !== 'string' || !FHIR_RESOURCE_TYPES.includes(type))
    return [
      {
        path: 'resourceType',
        message: `resourceType must be one of ${FHIR_RESOURCE_TYPES.join(', ')}`,
      },
    ]
  if (typeof r.id !== 'string' || !/^[A-Za-z0-9\-.]{1,64}$/.test(r.id))
    issues.push({
      path: 'id',
      message: 'id must be 1 to 64 characters of letters, digits, - and .',
    })
  checkByType(type, r, issues)
  return issues
}
