// Format rules of the clinical systems toolkit (spec 0451 FR-5), registered with the field lint
// registry: `hl7v2_syntax` and `fhir_shape` check the raw text of a message_view inject and that
// its decoded table agrees with the raw message. Importing this module registers them;
// lint-rules.ts lists it. The checks themselves are pure and live in shared/clinical.
import { validateFhir } from '../../../shared/clinical/fhir'
import { decodedMismatches, validateHl7, type Hl7Decoded } from '../../../shared/clinical/hl7v2'
import { registerFieldLintRule, type FieldLintIssue, type FieldLintRule } from '../field-lint'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function decodedRows(v: unknown): Hl7Decoded[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({ field: str(r.field), meaning: str(r.meaning), value: str(r.value) }))
}

/** The value at a dotted path in a parsed FHIR resource, as text. */
function fhirValue(resource: unknown, path: string): string {
  const v = path
    .split('.')
    .reduce<unknown>(
      (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
      resource,
    )
  return v === undefined || v === null ? '' : String(v)
}

const hl7: FieldLintRule = {
  id: 'hl7v2_syntax',
  injectTypes: ['message_view'],
  check(fields) {
    if (fields.format !== 'hl7v2') return []
    const raw = str(fields.raw)
    const out: FieldLintIssue[] = validateHl7(raw).map((i) => ({
      path: 'fields.raw',
      message: `${i.segment}: ${i.message}`,
    }))
    for (const m of decodedMismatches(raw, decodedRows(fields.decoded)))
      out.push({ path: 'fields.decoded', message: m })
    return out
  },
}

const fhir: FieldLintRule = {
  id: 'fhir_shape',
  injectTypes: ['message_view'],
  check(fields) {
    if (fields.format !== 'fhir') return []
    const raw = str(fields.raw)
    const out: FieldLintIssue[] = validateFhir(raw).map((i) => ({
      path: 'fields.raw',
      message: i.path ? `${i.path}: ${i.message}` : i.message,
    }))
    let resource: unknown
    try {
      resource = JSON.parse(raw)
    } catch {
      return out
    }
    for (const row of decodedRows(fields.decoded)) {
      const actual = fhirValue(resource, row.field)
      if (actual !== row.value)
        out.push({
          path: 'fields.decoded',
          message: `${row.field} shows "${row.value}" but the resource has "${actual}"`,
        })
    }
    return out
  },
}

registerFieldLintRule(hl7)
registerFieldLintRule(fhir)
