// Types for scripts/bench/score/lint.mjs.
import type { WarningLike } from '../types.d.mts'
export const SEVERITY_WEIGHTS: Record<string, number>
export function lintFindings<W extends Partial<WarningLike>>(warnings: W[]): W[]
export function lintScore(
  warnings: WarningLike[],
  rowCount: number,
  cap: number,
): {
  score: number
  penaltyPer10Rows: number | null
  byCode: Record<string, number>
  findings: number
}
