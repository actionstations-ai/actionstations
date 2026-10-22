// Near-miss identifiers (#165): a generated "Confluence Park Station" where the documents have
// "Confluence Station" is most likely the documented place under a slightly wrong name, so the
// lint says "did you mean Confluence Station?" instead of a plain unknown. Named identifiers
// only: "RTU-12" against "RTU-01", or "Unit 7" against 1 and 2, is a different numbered item.

const words = (s: string): string[] =>
  s
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)

/** A word that names something (three letters or more), not a number or a suffix letter. */
const isName = (w: string): boolean => /[A-Z]{3,}/.test(w)

/** Levenshtein distance, early exit above `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    if (Math.min(...row) > max) return max + 1
    prev = row
  }
  return prev[b.length]!
}

/** The same word, allowing one typo in a long alphabetic word ("Confluance"). */
const sameWord = (a: string, b: string): boolean =>
  a === b ||
  (a.length >= 5 && b.length >= 5 && /^[A-Z]+$/.test(a + b) && editDistance(a, b, 1) <= 1)

/** Share of the two word lists that match (fuzzy Jaccard), with the words that did not. */
function overlap(
  mine: string[],
  theirs: string[],
): { score: number; shared: string[]; rest: string[] } {
  const shared = mine.filter((w) => theirs.some((t) => sameWord(w, t)))
  const rest = [
    ...mine.filter((w) => !shared.includes(w)),
    ...theirs.filter((t) => !shared.some((w) => sameWord(w, t))),
  ]
  return { score: shared.length / (shared.length + rest.length), shared, rest }
}

const MIN_OVERLAP = 1 / 3

/**
 * The documented entry closest to an unknown identifier, or undefined when none is close.
 * `byId` maps each normalized identifier to the entry as written. A candidate must share a
 * distinctive name word (not the category's head noun such as STATION or DEPOT), differ in
 * a name word or a typo (not only in numbers) and overlap by a third or more.
 */
export function nearestEntry(id: string, byId: Map<string, string>): string | undefined {
  const mine = words(id)
  if (!mine.some(isName)) return undefined
  const heads = new Set([...byId.keys()].map((k) => words(k).at(-1)))
  let best: { entry: string; score: number } | undefined
  for (const [known, entry] of byId) {
    const { score, shared, rest } = overlap(mine, words(known))
    if (!shared.some((w) => isName(w) && !heads.has(w))) continue
    if (rest.length && rest.every((w) => /\d/.test(w))) continue
    if (score >= MIN_OVERLAP && score > (best?.score ?? 0)) best = { entry, score }
  }
  return best?.entry
}
