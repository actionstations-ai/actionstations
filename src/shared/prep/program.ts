// PREP in the program view (spec 0455 FR-10 (b) and (e), #782): what a project snapshot keeps
// about each PREP exercise, and the grouping of those exercises into the plan holder's exercise
// cycles with the core-component coverage, worst case discharge and countermeasure status of each
// cycle. Pure functions; generic exercise guidance, never a finding that a plan complies.
import { z } from 'zod'
import {
  CORE_COMPONENT_IDS,
  PREP_EXERCISE_KINDS,
  PREP_PLAN_RULES,
  PREP_PLAN_TYPES,
  cycleCoverage,
  cycleLine,
  cyclePosition,
  type CoreComponentId,
  type CycleCoverage,
  type PrepPlanType,
} from './index'

const Component = z.enum(CORE_COMPONENT_IDS)
const IsoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** What a project snapshot keeps about one PREP exercise (no names, no results text). */
export const SnapshotPrep = z.object({
  exerciseKind: z.enum(PREP_EXERCISE_KINDS),
  planType: z.enum(PREP_PLAN_TYPES),
  planHolder: z.string().max(200),
  /** First exercise date; empty when the scenario has none yet. */
  date: z.string().max(10),
  cycleStart: IsoDay.optional(),
  components: z.array(Component),
  notApplicable: z.array(Component),
  worstCaseDischarge: z.boolean(),
  countermeasuresInPlan: z.array(z.string().max(100)).max(5),
  countermeasuresExercised: z.array(z.string().max(100)).max(5),
})
export type SnapshotPrep = z.infer<typeof SnapshotPrep>

export interface PrepProgramExercise {
  projectName: string
  scenarioId: string
  title: string
  prep: SnapshotPrep
}

export interface PrepCycleView {
  key: string
  planType: PrepPlanType
  planTypeLabel: string
  planHolder: string
  /** Empty when no exercise of the plan holder says when its cycle began. */
  cycleLine: string
  cycleStart?: string
  cycleEnd?: string
  /** The exercises that count in this cycle, oldest first. */
  exercises: PrepProgramExercise[]
  coverage: CycleCoverage
  worstCaseDischarge: boolean
  /** Countermeasures the plan lists that no exercise in the cycle covered. */
  countermeasuresMissing: string[]
  /** Exercises left out because they are dated outside the cycle. */
  outsideCycle: number
}

const holderKey = (e: PrepProgramExercise): string =>
  `${e.prep.planType}:${e.prep.planHolder.trim().toLowerCase()}`

const byDate = (a: PrepProgramExercise, b: PrepProgramExercise): number =>
  a.prep.date.localeCompare(b.prep.date)

function unique(list: readonly string[]): string[] {
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))]
}

function viewOf(group: PrepProgramExercise[]): PrepCycleView {
  const sorted = [...group].sort(byDate)
  const latest = sorted.at(-1)!
  const { planType, planHolder } = latest.prep
  // The cycle comes from the newest exercise that names a start; without one every exercise counts.
  const withStart = [...sorted].reverse().find((e) => e.prep.cycleStart && e.prep.date)
  const position = withStart
    ? cyclePosition(planType, withStart.prep.cycleStart!, withStart.prep.date)
    : undefined
  const window = position ? { start: position.cycleStart, end: position.cycleEnd } : undefined
  const inside = sorted.filter(
    (e) => !window || (e.prep.date >= window.start && e.prep.date <= window.end),
  )
  const notApplicable = latest.prep.notApplicable as CoreComponentId[]
  const coverage = cycleCoverage(
    inside.map((e) => ({ date: e.prep.date, components: e.prep.components })),
    window,
    notApplicable,
  )
  const inPlan = unique(sorted.flatMap((e) => e.prep.countermeasuresInPlan))
  const done = new Set(unique(inside.flatMap((e) => e.prep.countermeasuresExercised)))
  return {
    key: holderKey(latest),
    planType,
    planTypeLabel: PREP_PLAN_RULES[planType].label,
    planHolder,
    cycleLine: position ? cycleLine(position) : '',
    ...(position ? { cycleStart: position.cycleStart, cycleEnd: position.cycleEnd } : {}),
    exercises: inside,
    coverage,
    worstCaseDischarge: inside.some((e) => e.prep.worstCaseDischarge),
    countermeasuresMissing: inPlan.filter((c) => !done.has(c)),
    outsideCycle: sorted.length - inside.length,
  }
}

/**
 * The plan holders' exercise cycles across the program's projects: exercises of the same plan type
 * and plan holder form one cycle (each project's own settings say when it began).
 */
export function prepCycles(exercises: readonly PrepProgramExercise[]): PrepCycleView[] {
  const groups = new Map<string, PrepProgramExercise[]>()
  for (const e of exercises) groups.set(holderKey(e), [...(groups.get(holderKey(e)) ?? []), e])
  return [...groups.values()]
    .map(viewOf)
    .sort(
      (a, b) => a.planHolder.localeCompare(b.planHolder) || a.planType.localeCompare(b.planType),
    )
}
