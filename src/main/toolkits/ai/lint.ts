// Format checks for the AI incident products (spec 0467 FR-4): a serious incident draft states
// the system, the date of awareness, the causal link assessment, the harm and the status; a
// notice never states a clock the Article 73 rules do not have; bank and account identifiers
// are fictional test values. Pure functions over an inject's fields; register-lint.ts wraps
// them as field lint rules.
import type { FieldLintIssue } from '../field-lint'

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/** A serious incident draft names the system, the awareness date, the causal link, the harm and the status. */
export function lintSeriousIncidentFields(fields: Record<string, unknown>): FieldLintIssue[] {
  const issues: FieldLintIssue[] = []
  const need = (path: string, value: unknown, what: string): void => {
    if (!text(value)) issues.push({ path, message: `A serious incident draft must state ${what}.` })
  }
  need('fields.system.name', obj(fields.system).name, 'the system')
  need('fields.awarenessDate', fields.awarenessDate, 'the date the provider became aware')
  const causal = obj(fields.causalLink)
  need('fields.causalLink.assessment', causal.assessment, 'the causal link assessment')
  need('fields.causalLink.basis', causal.basis, 'the basis of the causal link assessment')
  need('fields.harm', fields.harm, 'the harm')
  need('fields.status', fields.status, 'the status of the investigation')
  return issues
}

/** Clocks the Article 73 rules have, in the words a notice would use. */
const KNOWN_CLOCK =
  /\b(?:15|fifteen)\s+days\b|\b(?:2|two)\s+days\b|\b(?:10|ten)\s+days\b|\bfour\s+business\s+days\b|\b4\s+business\s+days\b/i
const ANY_DURATION =
  /\b\d+\s*(?:hours?|days?|business days?|weeks?|months?)\b|\b(?:one|two|three|four|five|six|seven|ten|fifteen|thirty)\s+(?:hours?|days?|weeks?|months?)\b/i

/** A stated deadline must be one the clock set has: 15, 2 or 10 days (Article 73), or four business days (8-K). */
export function lintClockStated(fields: Record<string, unknown>): FieldLintIssue[] {
  const stated = text(fields.clockStated)
  if (!stated || !ANY_DURATION.test(stated) || KNOWN_CLOCK.test(stated)) return []
  return [
    {
      path: 'fields.clockStated',
      message: `The deadline "${stated}" is not one the scenario's clocks have (15, 2 or 10 days from awareness under Article 73, or four business days under Form 8-K). Use the configured clock.`,
    },
  ]
}

/** Account and bank identifiers in an inject are fictional test values: TEST- followed by digits. */
const TEST_ACCOUNT = /^TEST-\d{4,}$/

export function lintTestIdentifiers(fields: Record<string, unknown>): FieldLintIssue[] {
  const issues: FieldLintIssue[] = []
  const check = (path: string, value: unknown): void => {
    const v = text(value)
    if (v && !TEST_ACCOUNT.test(v))
      issues.push({
        path,
        message: `"${v}" could be a real account number. Use a fictional test value: TEST- followed by digits (for example TEST-77310045).`,
      })
  }
  check('fields.company.account', obj(fields.company).account)
  const payments = Array.isArray(fields.payments) ? fields.payments : []
  payments.forEach((p, i) => check(`fields.payments[${i}].account`, obj(p).account))
  return issues
}
