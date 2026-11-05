// Exposure follow-up list (spec 0466 FR-8): the fictional staff who were in or near a room when a
// possible exposure was reported, how long each overlapped with the event, who counts as a
// close contact under a designer's rule, and when each can be reached. It reuses the
// epidemiology toolkit's seeded random source and fictional name pools and writes the same
// `contact_listed` events the contact reach metric (spec 0457) reads, so the metric scores a
// laboratory follow-up with no new code. No pathogen is involved: the list is about who must be
// told and evaluated.
import { z } from 'zod'
import { fictionalName, makeRng } from '../../epidemiology/simulate/rng'

const MIN_MS = 60_000
const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z')

export const FollowupParams = z.object({
  seed: z.number().int().default(1),
  room: z.string().min(1).max(80).default('Room 214'),
  eventAt: z.iso.datetime().default('2026-10-21T16:35:00Z'),
  /** People in the room at the time, and in the adjacent rooms. */
  inRoom: z.number().int().min(0).max(30).default(3),
  adjacent: z.number().int().min(0).max(60).default(6),
  /** A person is a close contact when present in the room at the time of the event. */
  unreachableFraction: z.number().min(0).max(1).default(0.1),
  /** Contacts are reached within this many hours of being listed at the latest. */
  maxReachHours: z.number().min(1).max(240).default(30),
  listedAt: z.iso.datetime().default('2026-10-21T17:10:00Z'),
})
export type FollowupParams = z.infer<typeof FollowupParams>

export interface FollowupContact {
  code: string
  name: string
  where: string
  close: boolean
  overlapMinutes: number
  reachedAt: string | null
}

export function runFollowup(raw: z.input<typeof FollowupParams>): FollowupContact[] {
  const p = FollowupParams.parse(raw)
  const rng = makeRng(p.seed)
  const listed = Date.parse(p.listedAt)
  const make = (n: number, where: string, close: boolean, from: number): FollowupContact[] =>
    Array.from({ length: n }, (_, i) => {
      const reachable = !rng.chance(p.unreachableFraction)
      return {
        code: `${close ? 'R' : 'A'}${from + i + 1}`,
        name: fictionalName(rng),
        where,
        close,
        overlapMinutes: close ? 5 + rng.int(55) : rng.int(10),
        reachedAt: reachable
          ? iso(listed + Math.round(rng.uniform(0.1, 1) * p.maxReachHours * 60) * MIN_MS)
          : null,
      }
    })
  return [
    ...make(p.inRoom, p.room, true, 0),
    ...make(p.adjacent, `adjacent to ${p.room}`, false, 0),
  ]
}
