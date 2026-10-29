// Placing planned exercises on the year-by-quarter grid (pure).
import type { PlannedExercise } from '@shared/schemas'

export interface Cell {
  year: number
  quarter: number
}

export function cellOf(e: PlannedExercise): Cell {
  if ('date' in e.when) {
    const [y, m] = e.when.date.split('-').map(Number)
    return { year: y!, quarter: Math.floor(((m ?? 1) - 1) / 3) + 1 }
  }
  return e.when
}

export const inCell = (e: PlannedExercise, c: Cell): boolean => {
  const at = cellOf(e)
  return at.year === c.year && at.quarter === c.quarter
}

/** Exercises that fall outside the cycle's years; shown in the list so none is hidden. */
export const outsideCycle = (
  list: PlannedExercise[],
  cycle: { startYear: number; years: number },
): PlannedExercise[] =>
  list.filter((e) => {
    const { year } = cellOf(e)
    return year < cycle.startYear || year >= cycle.startYear + cycle.years
  })

export const whenText = (e: PlannedExercise): string =>
  'date' in e.when ? e.when.date : `${e.when.year} Q${e.when.quarter}`
