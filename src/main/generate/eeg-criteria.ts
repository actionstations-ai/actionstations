// Evaluation criteria per MSEL row (#421, FR-4), derived from the Exercise Evaluation Guides
// and never stored: the critical tasks whose rowIds name the row, plus the row's own expected
// action as one criterion when no task maps to it, so no inject is left without something to
// observe. Pure, so the Facilitate screen, the live evaluator form (#416) and the exports share
// one implementation through evaluation:criteria.
import type { CriticalTask, Evaluation, MselRow, RowCriterion, Scenario } from '@shared/schemas'

/** The scenario's evaluation; empty for one built in a test without parsing the schema. */
export const evaluationOf = (s: Partial<Pick<Scenario, 'evaluation'>>): Evaluation =>
  s.evaluation ?? { objectiveCapabilities: [], eegs: [] }

/** Control cards go to the whole room and are not injects players act on. */
const CONTROL_TAGS = new Set<MselRow['purposeTag']>(['STARTEX', 'TIME_JUMP', 'ENDEX'])

export const isControlRow = (row: Pick<MselRow, 'purposeTag'>): boolean =>
  CONTROL_TAGS.has(row.purposeTag)

/** The criterion id of a row's own expected action. */
export const expectedCriterionId = (rowId: string): string => `${rowId}:expected`

export function allTasks(s: Pick<Scenario, 'evaluation'>): CriticalTask[] {
  return evaluationOf(s).eegs.flatMap((e) => e.criticalTasks)
}

/** The critical tasks linked to one row, in EEG order. */
export function tasksForRow(s: Pick<Scenario, 'evaluation'>, rowId: string): CriticalTask[] {
  return allTasks(s).filter((t) => t.rowIds.includes(rowId))
}

const fromTask = (row: MselRow, t: CriticalTask): RowCriterion => ({
  id: t.id,
  rowId: row.id,
  text: t.task,
  taskId: t.id,
  capability: t.capability,
  citation: t.citation,
})

/** Criteria for one row: its linked tasks, else (non-control rows) its expected action. */
export function criteriaForRow(s: Pick<Scenario, 'evaluation'>, row: MselRow): RowCriterion[] {
  const linked = tasksForRow(s, row.id).map((t) => fromTask(row, t))
  if (linked.length || isControlRow(row) || !row.expectedAction.trim()) return linked
  return [{ id: expectedCriterionId(row.id), rowId: row.id, text: row.expectedAction.trim() }]
}

/** Every row's criteria, in MSEL order. */
export function rowCriteria(s: Pick<Scenario, 'evaluation' | 'msel'>): RowCriterion[] {
  return s.msel.flatMap((row) => criteriaForRow(s, row))
}
