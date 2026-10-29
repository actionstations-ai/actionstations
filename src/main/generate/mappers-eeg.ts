// Map the eeg stage's output into Scenario.evaluation (#421): objective names → ids, role keys
// → ids, citation keys → Citations (a task whose key resolves to nothing is dropped: the plans
// decide what counts), rowIds → existing rows, task ids T-01…; locked tasks from an earlier
// run are kept and matched by capability and normalized text.
import { isCoreCapability, type CoreCapabilityId as CapabilityId } from '@shared/core-capabilities'
import { EVALUATION_LIMITS } from '@shared/schemas/evaluation'
import type {
  CriticalTask,
  Eeg,
  EegOutput,
  Evaluation,
  Objective,
  ObjectiveCapability,
  Scenario,
} from '@shared/schemas'
import { resolveToRoles } from './mappers'
import { resolveCitations, type RetrievedChunk } from './retrieval'

export interface EegMapResult {
  /** Citation keys no prompt showed; the tasks that cited them were dropped. */
  dropped: { rowId: string; keys: string[] }[]
  /** Objective names in the output that match no objective (skipped). */
  unknownObjectives: string[]
  /** Row ids a task named that are not in the MSEL (removed from the task). */
  unknownRows: { task: string; ids: string[] }[]
  /** Role keys that match no role (expectedBy left empty). */
  unknownRoles: { task: string; key: string }[]
  /** Capabilities that are not among the 32 (dropped before they reach the scenario). */
  unknownCapabilities: string[]
  /** Locked tasks from the previous run that were kept. */
  keptLocked: number
}

/** rowId the eeg stage's dropped citations and other pipeline warnings are recorded under. */
export const EEG_ROW = 'eeg'

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Model text trimmed to the schema's cap; undefined when empty. */
const clip = (s: string | undefined, max: number): string | undefined => {
  const t = s?.trim().slice(0, max)
  return t || undefined
}

/** Objective by exact name, then case-insensitive name, then exact text. */
function objectiveFor(name: string, objectives: Objective[]): Objective | undefined {
  return (
    objectives.find((o) => o.name === name.trim()) ??
    objectives.find((o) => norm(o.name) === norm(name)) ??
    objectives.find((o) => norm(o.text) === norm(name))
  )
}

/** Existing row ids for the ids the model wrote (case-insensitive), and the ones that match none. */
function matchRows(ids: string[], s: Scenario): { rowIds: string[]; unknown: string[] } {
  const byUpper = new Map(s.msel.map((r) => [r.id.toUpperCase(), r.id]))
  const rowIds: string[] = []
  const unknown: string[] = []
  for (const raw of ids) {
    const id = byUpper.get(raw.trim().toUpperCase())
    if (!id) unknown.push(raw)
    else if (!rowIds.includes(id)) rowIds.push(id)
  }
  return { rowIds, unknown }
}

/** Next free "T-nn" id. */
function nextTaskId(taken: Set<string>): string {
  for (let n = 1; ; n++) {
    const id = `T-${String(n).padStart(2, '0')}`
    if (!taken.has(id)) {
      taken.add(id)
      return id
    }
  }
}

type OutTask = EegOutput['eegs'][number]['criticalTasks'][number]

function mapTask(
  t: OutTask,
  capability: CapabilityId,
  objectiveRefs: string[],
  s: Scenario,
  chunks: RetrievedChunk[],
  result: EegMapResult,
): Omit<CriticalTask, 'id'> | undefined {
  const { citations, dropped } = resolveCitations([t.citation], chunks)
  const citation = citations[0]
  if (!citation) {
    result.dropped.push({ rowId: EEG_ROW, keys: dropped })
    return undefined
  }
  const rows = matchRows(t.rowIds, s)
  if (rows.unknown.length) result.unknownRows.push({ task: t.task, ids: rows.unknown })
  let expectedBy: string | undefined
  if (t.expectedBy?.trim()) {
    const role = resolveToRoles([t.expectedBy], s.roles)
    expectedBy = role.ids.length === 1 ? role.ids[0] : undefined
    if (!expectedBy) result.unknownRoles.push({ task: t.task, key: t.expectedBy })
  }
  const timing = clip(t.timing, EVALUATION_LIMITS.timing)
  return {
    capability,
    task: clip(t.task, EVALUATION_LIMITS.task) ?? '',
    citation,
    ...(expectedBy ? { expectedBy } : {}),
    ...(timing ? { timing } : {}),
    rowIds: rows.rowIds,
    objectiveRefs,
    locked: false,
  }
}

function mapObjectiveCapabilities(
  out: EegOutput,
  s: Scenario,
  result: EegMapResult,
): ObjectiveCapability[] {
  const pairs: ObjectiveCapability[] = []
  for (const oc of out.objectiveCapabilities) {
    const objective = objectiveFor(oc.objective, s.objectives)
    if (!objective) {
      result.unknownObjectives.push(oc.objective)
      continue
    }
    for (const c of oc.capabilities) {
      if (!isCoreCapability(c.capability)) {
        result.unknownCapabilities.push(c.capability)
        continue
      }
      if (pairs.some((p) => p.objectiveId === objective.id && p.capability === c.capability))
        continue
      pairs.push({
        objectiveId: objective.id,
        capability: c.capability,
        why: clip(c.why, EVALUATION_LIMITS.why) ?? '',
      })
    }
  }
  return pairs
}

/** Tasks of the previous run the designer locked; they survive the re-run. */
const lockedTasks = (evaluation: Evaluation): CriticalTask[] =>
  evaluation.eegs.flatMap((e) => e.criticalTasks.filter((t) => t.locked))

/**
 * Merge locked tasks into the fresh EEGs: a fresh task with the same capability and text is
 * replaced by the locked one; a locked task with no counterpart is appended to its capability's
 * EEG (created from the previous run when the model dropped the capability).
 */
function keepLocked(
  fresh: Eeg[],
  previous: Evaluation,
  taken: Set<string>,
  result: EegMapResult,
): Eeg[] {
  const eegs = fresh.map((e) => ({ ...e, criticalTasks: [...e.criticalTasks] }))
  for (const locked of lockedTasks(previous)) {
    let eeg = eegs.find((e) => e.capability === locked.capability)
    if (!eeg) {
      const prev = previous.eegs.find((e) => e.capability === locked.capability)!
      eeg = { ...prev, criticalTasks: [] }
      eegs.push(eeg)
    }
    const at = eeg.criticalTasks.findIndex((t) => norm(t.task) === norm(locked.task))
    if (at >= 0) eeg.criticalTasks[at] = locked
    else eeg.criticalTasks.push(locked)
    taken.add(locked.id)
    result.keptLocked++
  }
  return eegs
}

/** Give every unlocked task a fresh T-nn id (locked ones keep theirs), in EEG order. */
function assignIds(eegs: Eeg[], taken: Set<string>): Eeg[] {
  return eegs.map((e) => ({
    ...e,
    criticalTasks: e.criticalTasks.map((t) => (t.locked ? t : { ...t, id: nextTaskId(taken) })),
  }))
}

export function applyEeg(s: Scenario, out: EegOutput, chunks: RetrievedChunk[]): EegMapResult {
  const result: EegMapResult = {
    dropped: [],
    unknownObjectives: [],
    unknownRows: [],
    unknownRoles: [],
    unknownCapabilities: [],
    keptLocked: 0,
  }
  const objectiveCapabilities = mapObjectiveCapabilities(out, s, result)
  const refsFor = (capability: string): string[] =>
    objectiveCapabilities.filter((p) => p.capability === capability).map((p) => p.objectiveId)
  const seen = new Set<string>()
  const fresh: Eeg[] = []
  for (const e of out.eegs) {
    if (!isCoreCapability(e.capability)) {
      result.unknownCapabilities.push(e.capability)
      continue
    }
    if (seen.has(e.capability)) continue
    seen.add(e.capability)
    const objectiveRefs = refsFor(e.capability)
    const tasks = e.criticalTasks
      .map((t) => mapTask(t, e.capability, objectiveRefs, s, chunks, result))
      .filter((t): t is Omit<CriticalTask, 'id'> => !!t)
      .map((t) => ({ id: '', ...t }))
    fresh.push({
      capability: e.capability,
      target: clip(e.target, EVALUATION_LIMITS.target) ?? '',
      objectiveRefs,
      criticalTasks: tasks,
    })
  }
  const taken = new Set<string>()
  const merged = keepLocked(fresh, s.evaluation, taken, result)
  s.evaluation = {
    objectiveCapabilities,
    eegs: assignIds(merged, taken).filter((e) => e.criticalTasks.length),
  }
  return result
}
