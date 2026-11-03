// Types for scripts/bench/score/damage.mjs.
import type { Planted } from '../defects.d.mts'
interface Row {
  id: string
  purposeTag?: string
  from?: string
  event?: string
  expectedAction?: string
}
export const REWRITTEN: number
export function rowWeight(row: { purposeTag?: string }): number
export function changedFields(before: Row, after: Row): string[]
export function damageScore(input: {
  before: Row[]
  after: Row[]
  planted: Planted[]
  penalty: number
}): { damage: number; intact: number; damaged: { id: string; tag?: string; fields: string[] }[] }
