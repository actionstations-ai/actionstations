// Types for scripts/bench/score/grounding.mjs.
import type { GroundingLike } from '../types.d.mts'
export interface SupportCounts {
  support: number
  claimBearing: number
  grounded: number
  review: number
  unsupported: number
}
export function supportScore(results: ({ label: string } | undefined)[]): SupportCounts
export function rowResults(grounding: GroundingLike | undefined): { label: string }[]
