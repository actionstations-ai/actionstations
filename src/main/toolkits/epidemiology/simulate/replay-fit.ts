// Simulated cases that fit a real aggregate (spec 0457 FR-10). A replayed scenario has real weekly
// counts and no real line list, because none exists publicly. Individual cases are simulated so
// that each week holds exactly the real count, with onset times spread over the week. Every
// case carries `simulated: true`; nothing here is, or may be shown as, a record of a real person.
import { makeRng } from './rng'

const WEEK_MS = 7 * 86_400_000

export interface WeeklyCount {
  /** The Saturday (or last day) the week ends, ISO. */
  t: string
  v: number
}

export interface FittedCase {
  code: string
  onsetMs: number
  /** Always true: a case drawn to fit an aggregate. */
  simulated: true
}

export function casesFromWeeklyCounts(series: readonly WeeklyCount[], seed = 1): FittedCase[] {
  const rng = makeRng(seed)
  const out: FittedCase[] = []
  let serial = 0
  for (const w of [...series].sort((a, b) => Date.parse(a.t) - Date.parse(b.t))) {
    const end = Date.parse(w.t) + 86_400_000 // the week ends at the close of its last day
    const n = Math.max(0, Math.round(w.v))
    for (let i = 0; i < n; i++) {
      serial++
      out.push({
        code: `R${String(serial).padStart(3, '0')}`,
        onsetMs: Math.floor(end - WEEK_MS + rng.next() * WEEK_MS),
        simulated: true,
      })
    }
  }
  return out.sort((a, b) => a.onsetMs - b.onsetMs || a.code.localeCompare(b.code))
}
