// The program health dashboard's computation (#438, spec 0438): which Core Capabilities and plan
// sections have been exercised, when, and what has never been tested, from the program's project
// snapshots, schedule and corrective actions. Pure: no clock beyond `now`, no files, no network.
import { CORE_CAPABILITIES, type MissionArea } from '../core-capabilities'
import type {
  Program,
  ProgramAction,
  ProjectSnapshot,
  Schedule,
  SnapshotScenario,
} from '../schemas/program'
import {
  HEALTH_SNAPSHOT_STALE_DAYS,
  HEALTH_STALE_MONTHS,
  type CapabilityHealth,
  type ExerciseRef,
  type HealthFilter,
  type NeverTested,
  type ProgramHealth,
  type TimelineEntry,
} from '../schemas/program-health'
import { actionsHealth } from './health-actions'
import {
  indexDocuments,
  resolveRef,
  sectionBuilder,
  type DocIndex,
  type SectionBuilder,
} from './health-sections'
import {
  cycleQuarters,
  daysBetween,
  monthsBefore,
  plannedQuarter,
  quarterEnd,
  quarterOf,
} from './health-time'
import { isActive, isOverdue } from './status'

export { normalizeHeading } from './health-sections'
export { quarterOf, cycleQuarters } from './health-time'

export interface HealthInput {
  program: Program
  schedule: Schedule
  snapshots: ProjectSnapshot[]
  actions: ProgramAction[]
}

type ResolvedFilter = ProgramHealth['filter']
type Planned = Schedule['exercises'][number]

interface Exercise {
  ref: ExerciseRef
  scenario: SnapshotScenario
  snapshot: ProjectSnapshot
}

const yearOf = (iso: string): number => Number(iso.slice(0, 4))
const overlaps = (a: readonly string[], b: readonly string[]): boolean =>
  a.some((x) => b.includes(x))

function resolveFilter(filter: HealthFilter): ResolvedFilter {
  return {
    ...filter,
    staleAfterMonths: filter.staleAfterMonths ?? HEALTH_STALE_MONTHS,
    includeOwners: filter.includeOwners ?? true,
  }
}

const capabilityAreas = new Map<string, readonly MissionArea[]>(
  CORE_CAPABILITIES.map((c) => [c.id, c.areas]),
)

/** An item passes the mission-area filter when any of its capabilities is in a chosen area. */
function inAreas(filter: ResolvedFilter, capabilities: readonly string[]): boolean {
  if (!filter.missionAreas?.length || !capabilities.length) return true
  return capabilities.some((c) => overlaps(capabilityAreas.get(c) ?? [], filter.missionAreas!))
}

function collectExercises(snapshots: ProjectSnapshot[], filter: ResolvedFilter): Exercise[] {
  const out: Exercise[] = []
  for (const snapshot of snapshots)
    for (const scenario of snapshot.scenarios) {
      if (!scenario.exercisedAt || scenario.status === 'archived') continue
      if (filter.years && !filter.years.includes(yearOf(scenario.exercisedAt))) continue
      const ref: ExerciseRef = {
        projectId: snapshot.projectId,
        projectName: snapshot.name,
        scenarioId: scenario.scenarioId,
        title: scenario.title,
        exercisedAt: scenario.exercisedAt,
        reachable: snapshot.reachable,
      }
      out.push({ ref, scenario, snapshot })
    }
  return out
}

function plannedFor(schedule: Schedule, filter: ResolvedFilter): Planned[] {
  return schedule.exercises.filter((e) => {
    if (e.status !== 'planned' && e.status !== 'scheduled') return false
    if (filter.projectIds && (!e.projectId || !filter.projectIds.includes(e.projectId)))
      return false
    if (filter.years && !filter.years.includes(yearOf(plannedQuarter(e)))) return false
    return inAreas(filter, e.coreCapabilities)
  })
}

function filterActions(actions: ProgramAction[], filter: ResolvedFilter): ProgramAction[] {
  return actions.filter((a) => {
    const { projectId, exerciseDate } = a.source
    if (filter.projectIds && projectId && !filter.projectIds.includes(projectId)) return false
    if (filter.projectIds && !projectId) return false
    if (filter.years && exerciseDate && !filter.years.includes(yearOf(exerciseDate))) return false
    return inAreas(filter, a.coreCapabilities)
  })
}

function sumRatings(scenarios: SnapshotScenario[]): CapabilityHealth['results'] {
  const rated = scenarios.filter((s) => s.ratings)
  if (!rated.length) return undefined
  const total = { met: 0, partial: 0, notMet: 0, notObserved: 0 }
  for (const s of rated)
    for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += s.ratings![k]
  return total
}

function count(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1
}

interface CapabilityContext {
  program: Program
  now: Date
  today: string
  filter: ResolvedFilter
  exercises: Exercise[]
  planned: Planned[]
  actions: ProgramAction[]
  quarters: string[]
}

function statusOf(ctx: CapabilityContext, last: string | undefined, planned: number) {
  if (!last) return planned ? ('planned' as const) : ('never' as const)
  const cycleStart = `${ctx.program.cycle.startYear}-01-01`
  const cutoff = monthsBefore(ctx.now, ctx.filter.staleAfterMonths)
  return last.slice(0, 10) < cycleStart || last.slice(0, 10) < cutoff
    ? ('stale' as const)
    : ('current' as const)
}

function capabilityRow(ctx: CapabilityContext, id: string, label: string): CapabilityHealth {
  const mine = ctx.exercises.filter((e) => e.scenario.coreCapabilities.includes(id as never))
  const planned = ctx.planned.filter((e) => e.coreCapabilities.includes(id as never))
  const related = ctx.actions.filter((a) => a.coreCapabilities.includes(id as never))
  const byQuarter: Record<string, number> = {}
  const plannedByQuarter: Record<string, number> = {}
  for (const e of mine) {
    const q = quarterOf(e.ref.exercisedAt!)
    if (ctx.quarters.includes(q)) count(byQuarter, q)
  }
  for (const e of planned) {
    const q = plannedQuarter(e)
    if (ctx.quarters.includes(q)) count(plannedByQuarter, q)
  }
  const last = mine
    .map((e) => e.ref.exercisedAt!)
    .sort()
    .at(-1)
  const { startYear, years } = ctx.program.cycle
  return {
    id: id as never,
    label,
    missionAreas: [...(capabilityAreas.get(id) ?? [])],
    status: statusOf(ctx, last, planned.length),
    exercises: mine.map((e) => e.ref).sort((a, b) => b.exercisedAt!.localeCompare(a.exercisedAt!)),
    lastExercisedAt: last,
    inCycle: mine.filter((e) => {
      const y = yearOf(e.ref.exercisedAt!)
      return y >= startYear && y < startYear + years
    }).length,
    results: sumRatings(mine.map((e) => e.scenario)),
    openActions: related.filter(isActive).length,
    overdueActions: related.filter((a) => isOverdue(a, ctx.today)).length,
    priorityIds: ctx.program.priorities
      .filter((p) => p.coreCapabilities.includes(id as never))
      .map((p) => p.id),
    plannedExerciseIds: planned.map((e) => e.id),
    byQuarter,
    plannedByQuarter,
  }
}

function capabilityRows(ctx: CapabilityContext): CapabilityHealth[] {
  return CORE_CAPABILITIES.filter((c) => inAreas(ctx.filter, [c.id])).map((c) =>
    capabilityRow(ctx, c.id, c.name),
  )
}

function buildSections(
  index: DocIndex,
  exercises: Exercise[],
  actions: ProgramAction[],
  snapshots: ProjectSnapshot[],
): SectionBuilder {
  const builder = sectionBuilder(index)
  for (const { key, doc } of index.docs.values())
    for (const label of doc.sections) builder.declare(key, [label])
  for (const e of exercises)
    for (const ref of e.scenario.planSections) {
      const { key, segments } = resolveRef(index, e.ref.projectId, ref)
      builder.cite(key, segments, e.ref)
    }
  for (const snap of snapshots)
    for (const d of snap.drills ?? []) {
      const { key, segments } = resolveRef(index, snap.projectId, d.planSection)
      if (segments.length) builder.practise(key, segments, d.at)
    }
  for (const a of actions.filter(isActive))
    for (const ref of a.planSections) {
      const { key, segments } = resolveRef(index, a.source.projectId, ref)
      if (segments.length) builder.addAction(key, segments)
    }
  return builder
}

function neverTested(
  capabilities: CapabilityHealth[],
  sections: ProgramHealth['sections'],
  index: DocIndex,
  planned: Planned[],
  today: string,
  filter: ResolvedFilter,
): NeverTested {
  const cited = new Set(sections.filter((s) => !s.never).map((s) => s.documentKey))
  return {
    capabilities: capabilities
      .filter((c) => c.status === 'never' && c.priorityIds.length)
      .map((c) => ({ id: c.id, label: c.label, priorityIds: c.priorityIds })),
    documents: [...index.docs.values()]
      .filter(
        (d) => !cited.has(d.key) && (!filter.documentKeys || filter.documentKeys.includes(d.key)),
      )
      .map((d) => ({
        documentKey: d.key,
        documentTitle: d.doc.title,
        projectNames: [...d.projectNames].sort(),
      }))
      .sort((a, b) => a.documentTitle.localeCompare(b.documentTitle)),
    sections: sections.filter((s) => s.never && s.documentKind === 'plan' && s.depth <= 2),
    overduePlanned: planned
      .filter((e) => quarterEnd(plannedQuarter(e)) < today)
      .map((e) => ({ id: e.id, title: e.title, when: plannedQuarter(e), type: e.type })),
  }
}

function timelineOf(
  exercises: Exercise[],
  planned: Planned[],
  mapped: (s: SnapshotScenario) => number,
): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  for (const e of exercises) {
    entries.push({
      quarter: quarterOf(e.ref.exercisedAt!),
      kind: 'exercise',
      title: e.ref.title,
      capabilities: mapped(e.scenario),
      ref: e.ref,
    })
    for (const run of e.scenario.drillRuns ?? [])
      entries.push({
        quarter: quarterOf(run.ranAt),
        kind: 'drill',
        title: e.ref.title,
        capabilities: mapped(e.scenario),
        ref: e.ref,
        drill: { pass: run.pass, fail: run.fail, partial: run.partial },
      })
  }
  for (const p of planned)
    entries.push({
      quarter: plannedQuarter(p),
      kind: 'planned',
      title: p.title,
      type: p.type,
      capabilities: p.coreCapabilities.length,
      plannedExerciseId: p.id,
    })
  return entries.sort(
    (a, b) => a.quarter.localeCompare(b.quarter) || a.title.localeCompare(b.title),
  )
}

function freshness(snapshots: ProjectSnapshot[], now: Date): ProgramHealth['freshness'] {
  const today = now.toISOString().slice(0, 10)
  return snapshots
    .map((s) => ({
      projectId: s.projectId,
      name: s.name,
      takenAt: s.takenAt,
      reachable: s.reachable,
      stale:
        !s.reachable || daysBetween(s.takenAt.slice(0, 10), today) > HEALTH_SNAPSHOT_STALE_DAYS,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Compute the dashboard. `now` is the only clock; filters apply to every panel at once. */
export function computeHealth(
  input: HealthInput,
  filterIn: HealthFilter,
  now: Date,
): ProgramHealth {
  const filter = resolveFilter(filterIn)
  const { program } = input
  const today = now.toISOString().slice(0, 10)
  const snapshots = input.snapshots.filter(
    (s) => !filter.projectIds || filter.projectIds.includes(s.projectId),
  )
  const index = indexDocuments(snapshots)
  const exercises = collectExercises(snapshots, filter)
  const planned = plannedFor(input.schedule, filter)
  const actions = filterActions(input.actions, filter)
  const quarters = cycleQuarters(program.cycle)
  const capabilities = capabilityRows({
    program,
    now,
    today,
    filter,
    exercises,
    planned,
    actions,
    quarters,
  })
  const mappedExercises = exercises.filter((e) => e.scenario.coreCapabilities.length)
  const builder = buildSections(index, exercises, actions, snapshots)
  const allSections = builder.rows()
  const sections = filter.documentKeys
    ? allSections.filter((s) => filter.documentKeys!.includes(s.documentKey))
    : allSections
  const actionsOut = actionsHealth(actions, {
    today,
    cycle: program.cycle,
    includeOwners: filter.includeOwners,
  })
  return {
    computedAt: now.toISOString(),
    filter,
    cycle: { ...program.cycle, quarters },
    freshness: freshness(snapshots, now),
    capabilities,
    sections,
    actions: actionsOut,
    neverTested: neverTested(capabilities, sections, index, planned, today, filter),
    timeline: timelineOf(exercises, planned, (s) => s.coreCapabilities.length),
    unmappedExercises: exercises.length - mappedExercises.length,
    totals: {
      exercises: exercises.length,
      capabilitiesCurrent: capabilities.filter((c) => c.status === 'current').length,
      capabilitiesNever: capabilities.filter((c) => c.status === 'never').length,
      sectionsCited: sections.filter((s) => !s.never).length,
      sectionsNever: sections.filter((s) => s.never).length,
      openActions: actions.filter(isActive).length,
      overdueActions: actionsOut.overdue.length,
    },
  }
}
