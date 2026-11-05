// A small seeded random number generator for the outbreak simulations (spec 0457, FR-6..FR-9).
// mulberry32 is public domain, fast and fully determined by a 32-bit seed, so a fixed seed gives
// the same outbreak on every machine. Every simulation takes a seed and uses only this source.

export interface Rng {
  /** Uniform on [0, 1). */
  next(): number
  /** Uniform on [lo, hi). */
  uniform(lo: number, hi: number): number
  /** Integer on [0, n). */
  int(n: number): number
  /** True with probability p. */
  chance(p: number): boolean
  /** Standard normal (Box-Muller). */
  normal(): number
  /** Poisson with mean `lambda` (Knuth for small means, normal approximation above 60). */
  poisson(lambda: number): number
  /** Binomial(n, p): exact Bernoulli sum for n up to 400, normal approximation above. */
  binomial(n: number, p: number): number
  /** Lognormal with the given median and log-scale sigma. */
  lognormal(median: number, sigma: number): number
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
  const normal = (): number => {
    let u = next()
    while (u === 0) u = next()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next())
  }
  const poisson = (lambda: number): number => {
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
  }
  const binomial = (n: number, p: number): number => {
    if (n <= 0 || p <= 0) return 0
    if (p >= 1) return n
    if (n <= 400) {
      let k = 0
      for (let i = 0; i < n; i++) if (next() < p) k++
      return k
    }
    const mean = n * p
    const sd = Math.sqrt(n * p * (1 - p))
    return Math.min(n, Math.max(0, Math.round(mean + sd * normal())))
  }
  return {
    next,
    uniform: (lo, hi) => lo + (hi - lo) * next(),
    int: (n) => Math.floor(next() * n),
    chance: (p) => next() < p,
    normal,
    poisson,
    binomial,
    lognormal: (median, sigma) => median * Math.exp(sigma * normal()),
    pick: (items) => items[Math.floor(next() * items.length)]!,
  }
}

const FIRST = [
  'Alma',
  'Bram',
  'Cora',
  'Dario',
  'Edie',
  'Felix',
  'Gwen',
  'Hugo',
  'Iris',
  'Jonas',
  'Kira',
  'Leo',
  'Mina',
  'Nico',
  'Opal',
  'Pablo',
  'Quinn',
  'Rosa',
  'Sven',
  'Tessa',
  'Uma',
  'Victor',
  'Wren',
  'Xavi',
  'Yara',
  'Zane',
  'Amara',
  'Boris',
  'Celia',
  'Dev',
] as const
const LAST = [
  'Ashby',
  'Brandt',
  'Cole',
  'Dunn',
  'Ellis',
  'Frost',
  'Grady',
  'Hale',
  'Ibarra',
  'Joyce',
  'Kerr',
  'Lowe',
  'Marlow',
  'Nash',
  'Okoye',
  'Pruitt',
  'Quill',
  'Reyes',
  'Stone',
  'Tran',
  'Ueda',
  'Vance',
  'Walsh',
  'Yates',
  'Zimmer',
  'Abbott',
  'Bishop',
  'Crane',
  'Doyle',
  'Eason',
] as const

/** A fictional name: the pools are fixed and the pairing is seeded and arbitrary. */
export const fictionalName = (rng: Rng): string => `${rng.pick(FIRST)} ${rng.pick(LAST)}`
