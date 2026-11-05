// A small seeded random number generator for the human services simulations (spec 0464 FR-9).
// mulberry32 is public domain, fast and fully determined by a 32-bit seed, so a fixed seed gives
// the same surge, shelter or reunification on every machine. Every simulation takes a seed and
// uses only this source.

export interface Rng {
  /** Uniform on [0, 1). */
  next(): number
  /** True with probability p. */
  chance(p: number): boolean
  /** Standard normal (Box-Muller). */
  normal(): number
  /** Poisson with mean `lambda` (Knuth for small means, normal approximation above 60). */
  poisson(lambda: number): number
  /** Lognormal with the given median and log-scale sigma. */
  lognormal(median: number, sigma: number): number
  /** Pick one index by weight. */
  weighted(weights: readonly number[]): number
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
  const normal = (): number => {
    let u = next()
    while (u === 0) u = next()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next())
  }
  return {
    next,
    chance: (p) => next() < p,
    normal,
    poisson(lambda) {
      if (lambda <= 0) return 0
      if (lambda > 60) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal()))
      const limit = Math.exp(-lambda)
      let k = 0
      let p = 1
      do {
        k++
        p *= next()
      } while (p > limit)
      return k - 1
    },
    lognormal: (median, sigma) => median * Math.exp(sigma * normal()),
    weighted(weights) {
      const total = weights.reduce((s, w) => s + w, 0)
      let r = next() * total
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i]!
        if (r < 0) return i
      }
      return weights.length - 1
    },
  }
}
