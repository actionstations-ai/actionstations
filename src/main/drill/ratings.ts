// The latest rating per criterion (#431, FR-8, FR-10): observations from Facilitate, paper EEGs
// and live play name a row, a task or a criterion; the criteria of a scenario come from its
// evaluation guides (#421). The latest observation per row and criterion wins.
import type { Observation, Rating, Scenario } from '@shared/schemas'
import { expectedCriterionId, rowCriteria } from '../generate/eeg-criteria'

export interface RatedCriterion {
  rowId: string
  criterionId: string
  taskId?: string
  rating: Rating
}

export const ratingKey = (rowId: string, criterionId: string): string => `${rowId}|${criterionId}`

type Obs = Pick<Observation, 'id' | 'at' | 'rowId' | 'taskId' | 'criterionId' | 'rating'>

/** The criterion an observation rates, when it names one. */
function criterionOf(o: Obs): string | undefined {
  return o.criterionId ?? o.taskId ?? (o.rowId ? expectedCriterionId(o.rowId) : undefined)
}

/** The `rowId|criterionId` keys one observation rates; one without a row rates every row with the criterion. */
export function observationKeys(o: Obs, rowsOf: ReadonlyMap<string, string[]>): string[] {
  const cid = criterionOf(o)
  if (!cid) return []
  return (o.rowId ? [o.rowId] : (rowsOf.get(cid) ?? [])).map((row) => ratingKey(row, cid))
}

/** criterion id → the rows that carry it. */
export function criterionRows(
  scenario: Pick<Scenario, 'evaluation' | 'msel'>,
): Map<string, string[]> {
  const rowsOf = new Map<string, string[]>()
  for (const c of rowCriteria(scenario)) rowsOf.set(c.id, [...(rowsOf.get(c.id) ?? []), c.rowId])
  return rowsOf
}

/**
 * Every criterion of the scenario with its latest rating (not_observed when none), in MSEL
 * order. An observation without a row rates the criterion on every row that has it.
 */
export function latestRatings(
  scenario: Pick<Scenario, 'evaluation' | 'msel'>,
  observations: readonly Obs[],
): RatedCriterion[] {
  const criteria = rowCriteria(scenario)
  const byKey = new Map<string, RatedCriterion>(
    criteria.map((c) => [
      ratingKey(c.rowId, c.id),
      {
        rowId: c.rowId,
        criterionId: c.id,
        ...(c.taskId ? { taskId: c.taskId } : {}),
        rating: 'not_observed',
      },
    ]),
  )
  const rowsOf = criterionRows(scenario)
  const ordered = [...observations].sort(
    (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
  )
  for (const o of ordered) {
    for (const key of observationKeys(o, rowsOf)) {
      const hit = byKey.get(key)
      if (hit) hit.rating = o.rating
    }
  }
  return [...byKey.values()]
}
