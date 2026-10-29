// Types for scripts/bench/score/citations.mjs.
import type { ScenarioLike } from '../types.d.mts'
export function citationScore(scenario: Pick<ScenarioLike, 'msel' | 'warnings' | 'overview'>): {
  resolution: number
  coverage: number
  kept: number
  dropped: number
}
