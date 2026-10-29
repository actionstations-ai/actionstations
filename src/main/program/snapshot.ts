// Project snapshots (FR-11): what the program keeps about each linked project so the dashboard
// (#438) and "propose next exercise" work when the project folder is on another computer.
// Refreshed when the program opens, a project is linked, or a live session ends.
import { promises as fs } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { sectionKey } from '@shared/program/propose'
import {
  EvaluationRecord,
  Project,
  ProjectSnapshot,
  Scenario,
  type Drill,
  type Observation,
  type PlanSectionRef,
  type ProgramProjectLink,
  type SnapshotScenario,
} from '@shared/schemas'
import { FacilitatorState } from '@shared/ipc/facilitator'
import { LiveSession } from '@shared/schemas/live'
import { assembleRecord } from '../aar/record'
import { readLiveLog } from '../aar/sources/live-log'
import { listDrills } from '../drill/store'
import { microDrillSummaries } from '../microdrill/program'
import { exists, readJson, readJsonOr, writeJsonAtomic } from '../lib/fs'
import { nowIso } from '../lib/ids'
import { listRedlines } from '../redline/store'
import { requireProgram } from './guard'
import { resolveProjectPath } from './links'
import { markCompletedFromSnapshots } from './schedule'
import { announce, loadProgram, programPaths, readRevisioned } from './store'

const MAX_SECTIONS_PER_DOC = 60

async function readSessions(scenarioDir: string): Promise<string[]> {
  const live = join(scenarioDir, 'live')
  let ids: string[]
  try {
    ids = await fs.readdir(live)
  } catch {
    return []
  }
  const ended: string[] = []
  for (const id of ids) {
    try {
      const s = await readJson(join(live, id, 'session.json'), LiveSession)
      if (s.endedAt) ended.push(s.endedAt)
    } catch {
      // A damaged or half-written session never blocks the snapshot.
    }
  }
  return ended
}

/** Latest live session end, else latest delivered row, else absent (built but not run). */
export async function exercisedAtOf(scenarioDir: string): Promise<string | undefined> {
  const ended = (await readSessions(scenarioDir)).sort().at(-1)
  if (ended) return ended
  try {
    const state = await readJson(join(scenarioDir, 'facilitator.json'), FacilitatorState)
    return Object.values(state.delivered)
      .map((d) => d.at)
      .filter((at) => !Number.isNaN(Date.parse(at)))
      .sort()
      .at(-1)
  } catch {
    return undefined
  }
}

/** The latest observation per criterion, counted by rating. */
export function countRatings(
  observations: Observation[],
): NonNullable<SnapshotScenario['ratings']> {
  const latest = new Map<string, Observation>()
  for (const o of observations) {
    const key = o.criterionId ?? o.taskId ?? o.rowId ?? o.id
    const prev = latest.get(key)
    if (!prev || prev.at <= o.at) latest.set(key, o)
  }
  const counts = { met: 0, partial: 0, notMet: 0, notObserved: 0 }
  for (const o of latest.values()) {
    if (o.rating === 'met') counts.met++
    else if (o.rating === 'partial') counts.partial++
    else if (o.rating === 'not_met') counts.notMet++
    else counts.notObserved++
  }
  return counts
}

function planSectionsOf(scenario: Scenario, shaOf: Map<string, string>): PlanSectionRef[] {
  const seen = new Map<string, PlanSectionRef>()
  const all = [
    ...(scenario.overview?.coreSectionsTested ?? []),
    ...scenario.msel.flatMap((r) => r.citations),
  ]
  for (const c of all) {
    const sha = shaOf.get(c.documentId)
    const ref: PlanSectionRef = {
      documentId: c.documentId,
      documentTitle: c.documentTitle,
      headingPath: c.headingPath,
      ...(sha ? { documentSha256: sha } : {}),
    }
    seen.set(sectionKey(ref), ref)
  }
  return [...seen.values()]
}

/** Drill runs of the drill whose scenario this is (#431): corrective action verdicts per run. */
export function drillRunsOf(drills: Drill[], scenarioId: string): SnapshotScenario['drillRuns'] {
  const runs = drills
    .filter((d) => d.drillScenarioId === scenarioId)
    .flatMap((d) => d.runs)
    .map((r) => ({
      ranAt: r.ranAt,
      pass: r.correctiveActions.filter((a) => a.verdict === 'pass').length,
      fail: r.correctiveActions.filter((a) => a.verdict === 'fail').length,
      partial: r.correctiveActions.filter((a) => a.verdict === 'partial').length,
    }))
  return runs.length ? runs : undefined
}

/**
 * The scenario's observations from every source the AAR reads: `evaluation.json` and the live
 * session log (#424). A live session whose observations never reached `evaluation.json` still
 * counts; one that did is counted once.
 */
export async function observationsOf(
  root: string,
  scenario: Scenario,
  record: EvaluationRecord | null,
): Promise<Observation[]> {
  const live = await readLiveLog(root, scenario.id).catch(() => undefined)
  if (!live) return record?.observations ?? []
  try {
    return assembleRecord(scenario, { ...(record ? { evaluation: record } : {}), live })
      .observations
  } catch {
    return record?.observations ?? []
  }
}

async function snapshotScenario(
  root: string,
  id: string,
  shaOf: Map<string, string>,
  drills: Drill[] = [],
): Promise<SnapshotScenario | null> {
  const dir = join(root, 'scenarios', id)
  let scenario: Scenario
  try {
    scenario = await readJson(join(dir, 'scenario.json'), Scenario)
  } catch {
    return null
  }
  const record = await readJsonOr(
    join(dir, 'evaluation.json'),
    EvaluationRecord.nullable(),
    () => null,
  )
  const observations = await observationsOf(root, scenario, record)
  const capabilities = new Set([
    ...scenario.evaluation.objectiveCapabilities.map((c) => c.capability),
    ...scenario.evaluation.eegs.map((e) => e.capability),
  ])
  const exercisedAt = await exercisedAtOf(dir)
  return {
    scenarioId: scenario.id,
    title: scenario.title,
    status: scenario.status,
    ...(scenario.brief.threatFamily ? { threatFamily: scenario.brief.threatFamily } : {}),
    ...(exercisedAt ? { exercisedAt } : {}),
    coreCapabilities: [...capabilities],
    planSections: planSectionsOf(scenario, shaOf),
    ...(observations.length ? { ratings: countRatings(observations) } : {}),
    aarPresent: await exists(join(dir, 'aar.json')),
    ...(drillRunsOf(drills, id) ? { drillRuns: drillRunsOf(drills, id)! } : {}),
  }
}

/** The snapshot of one project folder. */
export async function snapshotProject(projectRoot: string): Promise<ProjectSnapshot> {
  const project = await readJson(join(projectRoot, 'project.json'), Project)
  const shaOf = new Map(project.documents.flatMap((d) => (d.sha256 ? [[d.id, d.sha256]] : [])))
  const scenarios: SnapshotScenario[] = []
  const drills = await listDrills(projectRoot)
  const redlines = (await listRedlines(projectRoot)).filter((r) => r.status !== 'rejected')
  for (const meta of project.scenarios) {
    const s = await snapshotScenario(projectRoot, meta.id, shaOf, drills)
    if (s) scenarios.push(s)
  }
  const practice = await microDrillSummaries(projectRoot, shaOf)
  return ProjectSnapshot.parse({
    projectId: project.id,
    name: project.name,
    orgName: project.orgName,
    orgType: project.orgType,
    takenAt: nowIso(),
    reachable: true,
    documents: project.documents.map((d) => ({
      id: d.id,
      title: d.title,
      ...(d.shortName ? { shortName: d.shortName } : {}),
      kind: d.kind,
      ...(d.sha256 ? { sha256: d.sha256 } : {}),
      ...(redlines.some((r) => r.target.documentId === d.id)
        ? { redlineCount: redlines.filter((r) => r.target.documentId === d.id).length }
        : {}),
      sections: d.headingsPreview.slice(0, MAX_SECTIONS_PER_DOC),
    })),
    scenarios,
    ...(practice.length ? { drills: practice } : {}),
  })
}

export async function readSnapshots(root: string): Promise<ProjectSnapshot[]> {
  const dir = programPaths(root).projects
  let names: string[]
  try {
    names = (await fs.readdir(dir)).filter((n) => /^[A-Za-z0-9_-]+\.json$/.test(n))
  } catch {
    return []
  }
  const out: ProjectSnapshot[] = []
  for (const n of names) {
    try {
      out.push((await readRevisioned(join(dir, n), ProjectSnapshot)).value)
    } catch {
      // A bad snapshot is skipped; the next refresh rewrites it.
    }
  }
  return out
}

async function refreshOne(root: string, link: ProgramProjectLink): Promise<void> {
  const target = programPaths(root).snapshot(link.projectId)
  const found = await resolveProjectPath(link, root)
  if (found.path) {
    await writeJsonAtomic(target, await snapshotProject(found.path))
    return
  }
  const old = await readJsonOr(target, ProjectSnapshot.nullable(), () => null)
  if (old) await writeJsonAtomic(target, { ...old, reachable: false })
}

/** Refresh the snapshots of the linked projects (all, or the ones named). */
export async function refreshSnapshots(root: string, projectIds?: string[]): Promise<void> {
  const program = await loadProgram(root)
  const wanted = program.projects.filter((l) => !projectIds || projectIds.includes(l.projectId))
  for (const link of wanted) {
    try {
      await refreshOne(root, link)
    } catch (e) {
      console.error('[program] snapshot failed for', link.projectId, (e as Error).message)
    }
  }
  await markCompletedFromSnapshots(root, await readSnapshots(root))
  announce(root, 'snapshots')
}

/**
 * After a live session ends (FR-11): refresh the snapshot of this project in the program it is
 * linked to. Only a program the user opened is touched; a failure never reaches the caller.
 */
export async function refreshProgramOfProject(projectRoot: string): Promise<void> {
  try {
    const project = await readJson(join(projectRoot, 'project.json'), Project)
    if (!project.program) return
    const hint = project.program.path
    const programRoot = isAbsolute(hint) ? hint : resolve(dirname(resolve(projectRoot)), hint)
    const root = await requireProgram(programRoot)
    if ((await loadProgram(root)).id !== project.program.id) return
    await refreshSnapshots(root, [project.id])
  } catch {
    // Not linked, program not open on this computer, or folder unreachable: nothing to refresh.
  }
}
