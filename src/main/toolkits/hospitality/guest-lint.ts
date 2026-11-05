// Format and consistency checks the guest emergency toolkit names (spec 0470 FR-5). Pure
// functions over structured inputs; each returns problems and never throws.

export const GUEST_LINT_RULES = ['hosp_accounting_reconciles', 'hosp_crime_report_roles'] as const

export interface GuestLintProblem {
  rule: (typeof GUEST_LINT_RULES)[number]
  message: string
}

/** One accounting row: expected (or registered) equals accounted for plus not accounted for. */
export interface AccountingRow {
  label: string
  total: number
  accounted: number
  unaccounted: number
}

/** Totals reconcile row by row, so a board never shows people who are neither counted nor missing. */
export function checkAccountingReconciles(rows: readonly AccountingRow[]): GuestLintProblem[] {
  return rows
    .filter((r) => r.accounted + r.unaccounted !== r.total)
    .map((r) => ({
      rule: 'hosp_accounting_reconciles' as const,
      message: `${r.label}: ${r.total} expected but ${r.accounted} accounted for plus ${r.unaccounted} not accounted for is ${r.accounted + r.unaccounted}.`,
    }))
}

const TITLED_NAME = /\b(?:Mr|Mrs|Ms|Miss|Dr)\.?\s+[A-Z][a-z]+/

/** A crime report names people by role code (Guest A), never by a personal name with a title. */
export function checkCrimeReportRoles(texts: readonly string[]): GuestLintProblem[] {
  return texts
    .filter((t) => TITLED_NAME.test(t))
    .map((t) => ({
      rule: 'hosp_crime_report_roles' as const,
      message: `The report names a person ("${TITLED_NAME.exec(t)?.[0] ?? ''}"); use role codes such as Guest A.`,
    }))
}
