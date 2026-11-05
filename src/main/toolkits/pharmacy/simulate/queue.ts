// The queue model (spec 0463 FR-8): prescriptions arrive at a rate that can surge, staff work
// them first in, first out at a service time per item, and the age of the oldest item is read
// against a target. Arrivals use a seeded generator, so a seed gives the same morning again.
// All values are simulated.
import { z } from 'zod'
import { createRng } from '../../ems/rng'

export const QueueParams = z.object({
  startDate: z.iso.datetime().default('2026-11-09T08:30:00Z'),
  queue: z.string().min(1).max(60).default('Verification'),
  minutes: z.number().int().min(30).max(1440).default(240),
  stepMinutes: z.number().int().min(5).max(60).default(15),
  arrivalsPerHour: z.number().min(0).max(240).default(18),
  /** Minutes one staff member needs per item. */
  serviceMinutes: z.number().positive().max(120).default(4),
  staff: z.number().int().min(0).max(20).default(2),
  /** A window with its own arrival rate (a claims backlog released, a lunch rush). */
  surges: z
    .array(
      z.object({
        fromMinute: z.number().int().min(0),
        toMinute: z.number().int().min(1),
        arrivalsPerHour: z.number().min(0).max(240),
      }),
    )
    .max(10)
    .default([]),
  /** From `atMinute` on, this many staff work the queue (a staffing decision). */
  staffChanges: z
    .array(z.object({ atMinute: z.number().int().min(0), staff: z.number().int().min(0).max(20) }))
    .max(20)
    .default([]),
  targetMinutes: z.number().positive().max(1440).default(20),
  seed: z.number().int().default(7),
})
export type QueueParams = z.output<typeof QueueParams>

export interface QueuePoint {
  minute: number
  count: number
  oldestMinutes: number
}

export interface QueueRun {
  points: QueuePoint[]
  /** First sampled minute with the oldest item past the target. */
  firstOverTarget: number | undefined
  peak: QueuePoint
  completed: number
}

const rateAt = (p: QueueParams, minute: number): number =>
  p.surges.find((s) => minute >= s.fromMinute && minute < s.toMinute)?.arrivalsPerHour ??
  p.arrivalsPerHour

const staffAt = (p: QueueParams, minute: number): number => {
  let staff = p.staff
  let at = -1
  for (const c of p.staffChanges) {
    if (c.atMinute > minute || c.atMinute < at) continue
    staff = c.staff
    at = c.atMinute
  }
  return staff
}

export function runQueue(p: QueueParams): QueueRun {
  const rng = createRng(p.seed)
  const waiting: number[] = []
  const points: QueuePoint[] = []
  let credit = 0
  let completed = 0
  for (let minute = 0; minute <= p.minutes; minute++) {
    // Up to two arrivals a minute, each with the rate's share of that minute.
    const perMinute = rateAt(p, minute) / 60
    for (let k = 0; k < 2; k++) if (rng.next() < perMinute / 2) waiting.push(minute)
    credit += staffAt(p, minute) / p.serviceMinutes
    while (credit >= 1 && waiting.length) {
      waiting.shift()
      completed++
      credit -= 1
    }
    if (!waiting.length) credit = Math.min(credit, 1)
    if (minute % p.stepMinutes === 0)
      points.push({
        minute,
        count: waiting.length,
        oldestMinutes: waiting.length ? minute - waiting[0]! : 0,
      })
  }
  const firstOverTarget = points.find((x) => x.oldestMinutes > p.targetMinutes)?.minute
  const peak = points.reduce((m, x) => (x.oldestMinutes > m.oldestMinutes ? x : m), points[0]!)
  return { points, firstOverTarget, peak, completed }
}
