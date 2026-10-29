// Pure helpers of the facilitator's Evaluation tab and hot wash roll-up (#421).
import type { Observation, Rating } from '@shared/schemas/evaluation'

/** One observation per (row, criterion) from the Facilitate screen; re-rating replaces it. */
export const observationId = (rowId: string, criterionId: string): string =>
  `O-${`${rowId}-${criterionId}`.replace(/[^A-Za-z0-9_-]+/g, '_')}`.slice(0, 128)

export type RatingCounts = Record<Rating, number>

/** How many observations carry each rating: counts, never a score. */
export function countRatings(observations: Observation[]): RatingCounts {
  const counts: RatingCounts = { met: 0, partial: 0, not_met: 0, not_observed: 0 }
  for (const o of observations) counts[o.rating]++
  return counts
}
