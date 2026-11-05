// A small seeded random source for the media simulators. The same seed always gives the same
// sequence, so a schedule or a spread curve is reproducible and testable.

/** mulberry32: a 32-bit seeded generator returning numbers in [0, 1). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** An integer in [min, max] inclusive. */
export const between = (rand: () => number, min: number, max: number): number =>
  min + Math.floor(rand() * (max - min + 1))

/** One element of a non-empty list. */
export const pick = <T>(rand: () => number, items: readonly T[]): T =>
  items[Math.floor(rand() * items.length)]!
