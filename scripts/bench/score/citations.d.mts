// Types for scripts/bench/score/citations.mjs.
import type { SupportCounts } from './grounding.d.mts'
import type { GroundingLike, ScenarioLike } from '../types.d.mts'
export function citationScore(
  scenario: Pick<ScenarioLike, 'msel' | 'warnings' | 'overview'>,
  grounding?: GroundingLike,
): {
  resolution: number
  coverage: number
  support?: number
  kept: number
  dropped: number
  grounding?: SupportCounts
}
