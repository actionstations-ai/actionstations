// A small seeded random number generator for the governance simulation (spec 0459 FR-6).
// mulberry32 is public domain and fully determined by a 32-bit seed, so a fixed seed gives the
// same incident on every machine.

export interface Rng {
  /** Uniform on [lo, hi). */
  uniform(lo: number, hi: number): number
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
  return { uniform: (lo, hi) => lo + (hi - lo) * next() }
}
