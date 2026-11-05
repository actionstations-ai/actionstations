// Rubric reliability (#736, spec 0453 FR-13b). Pure functions with documented formulas.
//
// Percent exact agreement and within-one-level agreement count every pair of raters on every
// item. Weighted Cohen's kappa (two raters) uses linear agreement weights
//   w(i, j) = 1 - |i - j| / (k - 1),   kappa_w = (Po - Pe) / (1 - Pe)
// where Po = sum w(i,j) p(i,j) and Pe = sum w(i,j) p(i,.) p(.,j). The intraclass correlation (three
// or more raters) is ICC(2,1), two-way random effects, absolute agreement, single rater
// (Shrout and Fleiss, 1979):
//   ICC = (MSR - MSE) / (MSR + (k - 1) MSE + k (MSC - MSE) / n)
// from a complete items-by-raters table. Small samples make these numbers unstable.

export interface RatingCell {
  raterId: string
  /** What was rated: a student and a criterion, joined by the caller. */
  itemId: string
  /** Level index, 0-based. */
  level: number
}

export interface Reliability {
  /** Items rated by two or more raters. */
  items: number
  /** Pairs of ratings compared. */
  pairs: number
  exact: number | null
  withinOne: number | null
  /** Weighted kappa when exactly two raters rated the items. */
  kappa: number | null
  /** ICC(2,1) when three or more raters rated the same items. */
  icc: number | null
  raters: number
  caveat: string | null
}

function byItem(ratings: RatingCell[]): Map<string, Map<string, number>> {
  const items = new Map<string, Map<string, number>>()
  for (const r of ratings) {
    const m = items.get(r.itemId) ?? new Map<string, number>()
    m.set(r.raterId, r.level)
    items.set(r.itemId, m)
  }
  return items
}

export function agreementPairs(ratings: RatingCell[]): {
  pairs: number
  exact: number
  within: number
} {
  let pairs = 0
  let exact = 0
  let within = 0
  for (const m of byItem(ratings).values()) {
    const levels = [...m.values()]
    for (let i = 0; i < levels.length; i++)
      for (let j = i + 1; j < levels.length; j++) {
        pairs++
        const gap = Math.abs(levels[i]! - levels[j]!)
        if (gap === 0) exact++
        if (gap <= 1) within++
      }
  }
  return { pairs, exact, within }
}

/** Weighted kappa from paired levels; null for fewer than two pairs or no spread in agreement. */
export function weightedKappa(pairs: Array<[number, number]>, categories: number): number | null {
  const n = pairs.length
  if (n < 2 || categories < 2) return null
  const row = new Array<number>(categories).fill(0)
  const col = new Array<number>(categories).fill(0)
  const weight = (i: number, j: number) => 1 - Math.abs(i - j) / (categories - 1)
  let observed = 0
  for (const [a, b] of pairs) {
    row[a]!++
    col[b]!++
    observed += weight(a, b) / n
  }
  let expected = 0
  for (let i = 0; i < categories; i++)
    for (let j = 0; j < categories; j++) expected += (weight(i, j) * row[i]! * col[j]!) / (n * n)
  return expected === 1 ? null : (observed - expected) / (1 - expected)
}

/** ICC(2,1) from complete rows (one row per item, one column per rater); null if under 2x2. */
export function icc21(table: number[][]): number | null {
  const n = table.length
  const k = table[0]?.length ?? 0
  if (n < 2 || k < 2) return null
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const grand = mean(table.flat())
  const rowMeans = table.map(mean)
  const colMeans = Array.from({ length: k }, (_, j) => mean(table.map((r) => r[j]!)))
  const ssr = k * rowMeans.reduce((s, m) => s + (m - grand) ** 2, 0)
  const ssc = n * colMeans.reduce((s, m) => s + (m - grand) ** 2, 0)
  const sst = table.flat().reduce((s, x) => s + (x - grand) ** 2, 0)
  const msr = ssr / (n - 1)
  const msc = ssc / (k - 1)
  const mse = (sst - ssr - ssc) / ((n - 1) * (k - 1))
  const denom = msr + (k - 1) * mse + (k * (msc - mse)) / n
  return denom === 0 ? null : (msr - mse) / denom
}

const SMALL = 'Fewer than 10 paired ratings: treat these numbers as unstable.'

export function reliability(ratings: RatingCell[], levelCount: number): Reliability {
  const items = byItem(ratings)
  const shared = [...items.values()].filter((m) => m.size >= 2)
  const raters = new Set(ratings.map((r) => r.raterId))
  const { pairs, exact, within } = agreementPairs(ratings)
  const out: Reliability = {
    items: shared.length,
    pairs,
    exact: pairs ? exact / pairs : null,
    withinOne: pairs ? within / pairs : null,
    kappa: null,
    icc: null,
    raters: raters.size,
    caveat: pairs < 10 ? SMALL : null,
  }
  if (raters.size === 2) {
    const [a, b] = [...raters]
    const paired = shared
      .filter((m) => m.has(a!) && m.has(b!))
      .map((m) => [m.get(a!)!, m.get(b!)!] as [number, number])
    out.kappa = weightedKappa(paired, levelCount)
  } else if (raters.size >= 3) {
    const ids = [...raters]
    const complete = shared.filter((m) => ids.every((id) => m.has(id)))
    out.icc = icc21(complete.map((m) => ids.map((id) => m.get(id)!)))
  }
  return out
}

/** Criteria ordered from lowest exact agreement up; criteria with no pair are left out. */
export function lowestAgreement(
  ratingsByCriterion: Map<string, RatingCell[]>,
  limit = 3,
): Array<{ criterionId: string; exact: number; pairs: number }> {
  const rows: Array<{ criterionId: string; exact: number; pairs: number }> = []
  for (const [criterionId, ratings] of ratingsByCriterion) {
    const { pairs, exact } = agreementPairs(ratings)
    if (pairs > 0) rows.push({ criterionId, exact: exact / pairs, pairs })
  }
  return rows.sort((a, b) => a.exact - b.exact || b.pairs - a.pairs).slice(0, limit)
}
