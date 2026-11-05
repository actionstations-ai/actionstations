// Guardian arrivals and verification throughput at a reunification site (spec 0464 FR-9).
// Each student has a guardian who arrives after the site opens (lognormal around a median);
// check-in leads verify identity one guardian at a time; a share cannot be verified at the desk
// and becomes an exception; a share of students have no guardian who comes. Parents arrive faster
// than staff can verify, so a queue builds. Students are exercise references (S-001). Every
// number is simulated.
import { z } from 'zod'
import { makeRng } from './rng'

export const ReunificationParams = z.object({
  seed: z.number().int().default(1),
  startTime: z.iso.datetime().default('2026-11-03T15:10:00Z'),
  students: z.number().int().min(5).max(2000).default(120),
  /** Median minutes after activation when a guardian arrives. */
  medianArrivalMin: z.number().min(1).max(600).default(35),
  /** Log-scale spread of arrivals; larger means a longer tail. */
  arrivalSigma: z.number().min(0.1).max(2).default(0.6),
  /** Check-in leads verifying identity at the same time. */
  checkInLeads: z.number().int().min(1).max(50).default(4),
  /** Median minutes one verification takes. */
  verifyMedianMin: z.number().min(0.2).max(30).default(2),
  /** Share of guardians who cannot be verified at the desk (no identification, not on the card). */
  unverifiableShare: z.number().min(0).max(1).default(0.04),
  /** Share of students for whom no guardian arrives within the exercise. */
  unaccompaniedShare: z.number().min(0).max(1).default(0.03),
  /** Minutes from verification to release (retrieval and hand-over). */
  retrievalMin: z.number().min(0).max(60).default(5),
})
export type ReunificationParams = z.output<typeof ReunificationParams>

export interface ReunificationStudent {
  ref: string
  grade: number
  /** Minutes after activation when the guardian arrives; undefined when none comes. */
  arrivalMin?: number
  /** Minutes after activation when verification finishes; undefined for an exception or none. */
  verifiedMin?: number
  /** Earliest minute the student can be released. */
  releaseReadyMin?: number
  exception: boolean
  unaccompanied: boolean
}

export interface ReunificationRun {
  params: ReunificationParams
  students: ReunificationStudent[]
}

export function runReunification(raw: z.input<typeof ReunificationParams>): ReunificationRun {
  const p = ReunificationParams.parse(raw)
  const rng = makeRng(p.seed)
  const students: ReunificationStudent[] = Array.from({ length: p.students }, (_, i) => {
    const unaccompanied = rng.chance(p.unaccompaniedShare)
    return {
      ref: `S-${String(i + 1).padStart(3, '0')}`,
      grade: 1 + Math.floor(rng.next() * 12),
      exception: false,
      unaccompanied,
      ...(unaccompanied
        ? {}
        : { arrivalMin: Math.round(rng.lognormal(p.medianArrivalMin, p.arrivalSigma) * 10) / 10 }),
    }
  })
  const arriving = students
    .filter((s) => s.arrivalMin !== undefined)
    .sort((a, b) => a.arrivalMin! - b.arrivalMin!)
  const freeAt = Array.from({ length: p.checkInLeads }, () => 0)
  for (const s of arriving) {
    const lead = freeAt.indexOf(Math.min(...freeAt))
    const start = Math.max(s.arrivalMin!, freeAt[lead]!)
    const service = Math.max(0.3, rng.lognormal(p.verifyMedianMin, 0.35))
    freeAt[lead] = start + service
    if (rng.chance(p.unverifiableShare)) {
      s.exception = true
    } else {
      s.verifiedMin = Math.round((start + service) * 10) / 10
      s.releaseReadyMin = Math.round((start + service + p.retrievalMin) * 10) / 10
    }
  }
  return { params: p, students }
}

export interface FlowPoint {
  minute: number
  arrived: number
  verified: number
  released: number
  exceptions: number
}

/** Cumulative counts every `stepMin` minutes until everyone who can be released is; "released" assumes immediate release at the earliest ready time. */
export function flowPoints(run: ReunificationRun, stepMin = 10): FlowPoint[] {
  const last = Math.max(
    0,
    ...run.students.flatMap((s) => [s.arrivalMin ?? 0, s.releaseReadyMin ?? 0]),
  )
  const out: FlowPoint[] = []
  for (let m = 0; m <= last + stepMin; m += stepMin) {
    out.push({
      minute: m,
      arrived: run.students.filter((s) => s.arrivalMin !== undefined && s.arrivalMin <= m).length,
      verified: run.students.filter((s) => s.verifiedMin !== undefined && s.verifiedMin <= m)
        .length,
      released: run.students.filter(
        (s) => s.releaseReadyMin !== undefined && s.releaseReadyMin <= m,
      ).length,
      exceptions: run.students.filter((s) => s.exception && s.arrivalMin! <= m).length,
    })
  }
  return out
}
