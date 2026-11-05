// A small seeded random number generator for the supply network simulation (spec 0462 FR-8).
// mulberry32 is public domain and fully determined by a 32-bit seed, so a fixed seed gives the
// same network, lots and disruption on every machine. Every simulation takes a seed.

export interface Rng {
  /** Uniform on [0, 1). */
  next(): number
  /** Integer on [lo, hi] inclusive. */
  between(lo: number, hi: number): number
  /** True with probability p. */
  chance(p: number): boolean
  /** Pick one item. */
  pick<T>(items: readonly T[]): T
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    between: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)]!,
  }
}
