// How old a regulation's "last checked" date is (spec 0467 NFR-5): the app warns when a clock
// definition has not been checked for twelve months, because the AI rules in particular change.

export const STALE_AFTER_MONTHS = 12

/** Whole months from an ISO date ("YYYY-MM-DD") to `today`. */
export function monthsSince(isoDate: string, today: Date): number {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
  const months = (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m)
  return today.getDate() < d ? months - 1 : months
}

/** True when the check is more than twelve months old. */
export const isStale = (verifiedOn: string, today: Date = new Date()): boolean =>
  monthsSince(verifiedOn, today) > STALE_AFTER_MONTHS
