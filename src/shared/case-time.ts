// Exercise time <-> case time (spec 0448 FR-9). Pure functions, shared by main (render) and the
// facilitator view. Exercise time is minutes on the exercise clock; case time is an instant in
// the case data's own history (epoch milliseconds, or an ISO string).
import type { CaseTimeMapping } from './schemas/case-data'
import type { GroundTruthEvent, MetricDecision, ModeledSeries } from './schemas/metrics'

const MIN = 60_000

const sortedJumps = (map: CaseTimeMapping) => [...map.jumps].sort((a, b) => a.atMin - b.atMin)

/** Case time (epoch ms) shown at `exerciseMin` of the exercise clock. */
export function caseTimeMs(exerciseMin: number, map: CaseTimeMapping): number {
  const skipped = sortedJumps(map)
    .filter((j) => j.atMin <= exerciseMin)
    .reduce((sum, j) => sum + j.skipMin, 0)
  const base = Date.parse(map.caseStart) + map.startOffsetMin * MIN
  return base + (exerciseMin * map.speed + skipped) * MIN
}

export const caseTimeIso = (exerciseMin: number, map: CaseTimeMapping): string =>
  new Date(caseTimeMs(exerciseMin, map)).toISOString()

/**
 * The exercise minute that shows `caseMs`. A case time inside a jump's skipped span was never
 * shown, so it maps to the minute of the jump. A case time before the start gives a negative
 * minute; callers decide what that means.
 */
export function exerciseMinFromCase(caseMs: number, map: CaseTimeMapping): number {
  const c = (caseMs - Date.parse(map.caseStart)) / MIN - map.startOffsetMin
  let skipped = 0
  for (const j of sortedJumps(map)) {
    const before = j.atMin * map.speed + skipped
    const after = before + j.skipMin
    if (c < before) break
    if (c < after) return j.atMin
    skipped += j.skipMin
  }
  return (c - skipped) / map.speed
}

/** Case minutes after the dataset's start, as an absolute case time. */
export const offsetToCaseMs = (rangeStartIso: string, offsetMin: number): number =>
  Date.parse(rangeStartIso) + offsetMin * MIN

/** "2024-09-26 14:05 UTC": the form shown beside the exercise clock. */
export function formatCaseTime(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

const HMM = /^(\d{1,3}):([0-5]\d)$/

/** Minutes of an exercise-clock time ("H:MM"), or undefined. */
export function exerciseMinutes(v: unknown): number | undefined {
  const m = HMM.exec(typeof v === 'string' ? v.trim() : '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined
}

/**
 * Decisions on the case clock, so they compare with case-data events and series. A decision's
 * own time field (the exercise time the player gave) wins, then the exercise time it was
 * recorded at; one with neither keeps its recorded time.
 */
export function onCaseClock(
  decisions: readonly MetricDecision[],
  mapping: CaseTimeMapping | undefined,
): MetricDecision[] {
  if (!mapping) return [...decisions]
  return decisions.map((d) => {
    const minutes = exerciseMinutes(d.fields.time) ?? exerciseMinutes(d.exerciseTime)
    return minutes === undefined ? d : { ...d, time: caseTimeIso(minutes, mapping) }
  })
}

/**
 * The case clock a measure reads its case data on: the scenario's own time mapping, else exercise
 * minute 0 at the start of the data (the dataset's time range, or its earliest event or point).
 * Undefined when there is neither, and the decisions keep the session clock.
 */
export function caseClockFor(
  mapping: CaseTimeMapping | undefined,
  data: {
    rangeStart?: string | undefined
    events?: readonly GroundTruthEvent[] | undefined
    series?: readonly ModeledSeries[] | undefined
  },
): CaseTimeMapping | undefined {
  if (mapping) return mapping
  const valid = (t: string | undefined): t is string => !!t && Number.isFinite(Date.parse(t))
  const earliest = [
    ...(data.events ?? []).map((e) => e.time),
    ...(data.series ?? []).flatMap((s) => s.points.map((p) => p.time)),
  ]
    .filter(valid)
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0]
  const start = valid(data.rangeStart) ? data.rangeStart : earliest
  return start ? { caseStart: start, startOffsetMin: 0, speed: 1, jumps: [] } : undefined
}
