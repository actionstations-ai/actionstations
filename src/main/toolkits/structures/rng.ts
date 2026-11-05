// A small seeded random number generator (mulberry32) for the structures simulations: the same
// seed gives the same monitoring noise and the same building damage, so a scenario regenerates
// identically.
export interface StructuresRng {
  /** A float in [0, 1). */
  next(): number
  /** A standard normal draw (Box-Muller). */
  normal(): number
  pick<T>(items: readonly T[]): T
}

export function createStructuresRng(seed: number): StructuresRng {
  let a = seed >>> 0
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const normal = (): number => {
    const u = Math.max(next(), 1e-12)
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next())
  }
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!
  return { next, normal, pick }
}
