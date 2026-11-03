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
  before?: { id: string }[]
  after?: { id: string }[]
  damagePenalty?: number
}): {
  recall: number
  noted: number
  fixed: number
  damage: number
  intact: number
  noise: number
  noisePer10Rows: number
  notes: number
  found: string[]
  notedIds: string[]
  fixedIds: string[]
  damaged: { id: string; tag?: string; fields: string[] }[]
  missed: string[]
}
