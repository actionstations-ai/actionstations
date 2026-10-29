// Lint score for a drafted scenario (#434, FR-10): the warnings scenarios:lint returns (the
// same lintScenario the app shows), weighted by severity, per 10 MSEL rows, mapped to 0–100.
// Critique notes are the model's own review, not lint findings, and are left out.

export const SEVERITY_WEIGHTS = { error: 5, warning: 2, info: 0.5 }

/** Lint findings only (scenarios:lint can carry stored critique notes too). */
export const lintFindings = (warnings) =>
  warnings.filter((w) => (w.source ?? 'lint') === 'lint' && w.code !== 'CRITIQUE')

/**
 * `cap`: the penalty per 10 rows that scores 0 (from the suite file). An empty MSEL scores 0:
 * there is nothing to credit.
 */
export function lintScore(warnings, rowCount, cap) {
  const findings = lintFindings(warnings)
  const byCode = {}
  let penalty = 0
  for (const w of findings) {
    byCode[w.code] = (byCode[w.code] ?? 0) + 1
    penalty += SEVERITY_WEIGHTS[w.severity] ?? 0
  }
  const per10 = rowCount > 0 ? (penalty / rowCount) * 10 : Infinity
  const score = rowCount > 0 ? Math.max(0, 100 * (1 - per10 / cap)) : 0
  return { score, penaltyPer10Rows: rowCount > 0 ? per10 : null, byCode, findings: findings.length }
}
