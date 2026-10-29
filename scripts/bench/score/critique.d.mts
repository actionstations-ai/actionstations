// Types for scripts/bench/score/critique.mjs.
import type { Planted } from '../defects.d.mts'
import type { WarningLike } from '../types.d.mts'
export function critiqueNotes<W extends Partial<WarningLike>>(warnings: W[]): W[]
export function critiqueScore(input: {
  notes: Partial<WarningLike>[]
  planted: Planted[]
  lints: Partial<WarningLike>[]
  rowCount: number
  noisePenalty: number
}): {
  recall: number
  noise: number
  noisePer10Rows: number
  notes: number
  found: string[]
  missed: string[]
}
