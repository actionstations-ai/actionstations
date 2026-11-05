// The diversion model (spec 0463 FR-8): cabinet removals by user and hour over a period. Peers
// follow the unit's daytime profile; one user's removals are higher and bunch into the small
// hours, with seeded innocent explanations (a float assignment, a cabinet outage) that account
// for part of the volume. A pattern in data is not proof of anything: users are fictional codes
// and the model says which part is explained. All values are simulated.
import { z } from 'zod'
import { createRng } from '../../ems/rng'

export const DiversionParams = z.object({
  startDate: z.iso.datetime().default('2026-10-06T00:00:00Z'),
  days: z.number().int().min(7).max(90).default(30),
  peers: z.number().int().min(3).max(20).default(7),
  /** How many times the peer median the divergent user removes. */
  multiple: z.number().min(1).max(10).default(2.4),
  /** Days the divergent user floated to a busier unit; their extra volume there is innocent. */
  floatDays: z.number().int().min(0).max(30).default(10),
  /** Hours of cabinet outage in the period (every user overrides during it). */
  outageHours: z.number().min(0).max(48).default(4),
  /** Day (from the start) on which the pattern is first reported. */
  discoveryDay: z.number().int().min(1).max(90).default(30),
  seed: z.number().int().default(23),
})
export type DiversionParams = z.output<typeof DiversionParams>

export interface UserUsage {
  user: string
  divergent: boolean
  total: number
  byHour: number[]
  overrides: number
  wastes: number
  discrepancies: number
}

export interface DiversionRun {
  users: UserUsage[]
  peerMedianTotal: number
  peerMedianByHour: number[]
  peerMaxByHour: number[]
  divergentUser: string
  /** Removals of the divergent user beyond the peer median that the float assignment explains. */
  explainedByFloat: number
  /** Removals beyond the peer median that nothing in the data explains. */
  unexplained: number
  discoveryTime: string
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** Peer weight of an hour: busier in the day, quiet at night. */
const dayWeight = (h: number): number => (h >= 7 && h <= 20 ? 1 : 0.15)

export function runDiversion(p: DiversionParams): DiversionRun {
  const rng = createRng(p.seed)
  const peerBase = 3 * p.days
  const users: UserUsage[] = []
  const spread = (total: number, weight: (h: number) => number): number[] => {
    const w = Array.from({ length: 24 }, (_, h) => weight(h))
    const sum = w.reduce((a, b) => a + b, 0)
    return w.map((x) => Math.round((total * x * (0.85 + rng.next() * 0.3)) / sum))
  }
  for (let i = 0; i < p.peers; i++) {
    const total = Math.round(peerBase * (0.85 + rng.next() * 0.3))
    const byHour = spread(total, dayWeight)
    users.push({
      user: `RN-${3000 + rng.int(100, 899)}`,
      divergent: false,
      total: byHour.reduce((a, b) => a + b, 0),
      byHour,
      overrides: rng.int(0, 2),
      wastes: rng.int(2, 5),
      discrepancies: rng.int(0, 1),
    })
  }
  const peerMedianTotal = median(users.map((u) => u.total))
  const target = Math.round(peerMedianTotal * p.multiple)
  const night = (h: number): number => (h >= 1 && h <= 5 ? 3 : dayWeight(h) * 0.6)
  const byHour = spread(target, night)
  const user: UserUsage = {
    user: `RN-${4000 + rng.int(100, 899)}`,
    divergent: true,
    total: byHour.reduce((a, b) => a + b, 0),
    byHour,
    overrides: Math.round(4 + p.multiple * 2),
    wastes: Math.round(peerBase / 3),
    discrepancies: 3,
  }
  users.unshift(user)
  const peers = users.filter((u) => !u.divergent)
  const peerMedianByHour = Array.from({ length: 24 }, (_, h) =>
    median(peers.map((u) => u.byHour[h]!)),
  )
  const peerMaxByHour = Array.from({ length: 24 }, (_, h) =>
    Math.max(...peers.map((u) => u.byHour[h]!)),
  )
  const excess = Math.max(0, user.total - peerMedianTotal)
  const explainedByFloat = Math.min(
    excess,
    Math.round((p.floatDays / p.days) * peerMedianTotal * 1.2),
  )
  const discovery = Date.parse(p.startDate) + p.discoveryDay * 86_400_000
  return {
    users,
    peerMedianTotal,
    peerMedianByHour,
    peerMaxByHour,
    divergentUser: user.user,
    explainedByFloat,
    unexplained: excess - explainedByFloat,
    discoveryTime: new Date(discovery).toISOString(),
  }
}
