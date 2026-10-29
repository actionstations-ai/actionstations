// Checks on the evaluation guides (#421, FR-9). They run only once a scenario has an
// evaluation: a scenario written before the eeg stage existed has none, and that is a
// readiness matter ("Generate evaluation guides"), not a warning. Pure; lint.ts adds them to
// lintScenario.
import { capabilityName, isCoreCapability } from '@shared/core-capabilities'
import type { LintWarning, Scenario } from '@shared/schemas'
import { allTasks, evaluationOf, isControlRow, tasksForRow } from './eeg-criteria'

export const EEG_CAPABILITY_MISSING = 'EEG_CAPABILITY_MISSING'
export const EEG_TASK_UNLINKED = 'EEG_TASK_UNLINKED'
export const EEG_ROW_UNCOVERED = 'EEG_ROW_UNCOVERED'
export const EEG_TASK_UNCITED = 'EEG_TASK_UNCITED'
export const EEG_CAPABILITY_UNKNOWN = 'EEG_CAPABILITY_UNKNOWN'

type W = LintWarning
const lint = (
  code: string,
  severity: W['severity'],
  message: string,
  extra: Partial<W> = {},
): W => ({
  code,
  severity,
  message,
  source: 'lint',
  ...extra,
})

/** True when the eeg stage (or the designer) has written anything to evaluate against. */
export function hasEvaluation(s: Pick<Scenario, 'evaluation'>): boolean {
  const e = evaluationOf(s)
  return e.eegs.length > 0 || e.objectiveCapabilities.length > 0
}

function lintObjectiveCapabilities(s: Scenario): W[] {
  const mapped = new Set(s.evaluation.objectiveCapabilities.map((p) => p.objectiveId))
  return s.objectives
    .filter((o) => !mapped.has(o.id))
    .map((o) =>
      lint(
        EEG_CAPABILITY_MISSING,
        'warning',
        `Objective "${o.name || o.text.slice(0, 40)}" is mapped to no Core Capability`,
        { suggestion: 'Pick one to three capabilities for it in the Evaluation tab' },
      ),
    )
}

function lintTasks(s: Scenario): W[] {
  const out: W[] = []
  for (const t of allTasks(s)) {
    if (!t.rowIds.length)
      out.push(
        lint(
          EEG_TASK_UNLINKED,
          'info',
          `Critical task ${t.id} ("${t.task}") is linked to no MSEL row`,
          {
            suggestion:
              'Link the rows where an evaluator could observe it, or accept it as an EEG-only task',
          },
        ),
      )
    if (!t.citation.documentId || !t.citation.headingPath)
      out.push(
        lint(
          EEG_TASK_UNCITED,
          'error',
          `Critical task ${t.id} ("${t.task}") cites no plan section`,
          {
            suggestion: 'Pick the plan section the task comes from, or remove the task',
          },
        ),
      )
  }
  return out
}

function lintRows(s: Scenario): W[] {
  if (!s.evaluation.eegs.length) return []
  return s.msel
    .filter((r) => !isControlRow(r) && !tasksForRow(s, r.id).length)
    .map((r) =>
      lint(EEG_ROW_UNCOVERED, 'info', `Row ${r.id} is covered by no critical task`, {
        rowId: r.id,
        suggestion: 'Evaluators rate its expected action as the criterion',
      }),
    )
}

function lintCapabilities(s: Scenario): W[] {
  const ids = [
    ...s.evaluation.objectiveCapabilities.map((p) => p.capability as string),
    ...s.evaluation.eegs.map((e) => e.capability as string),
  ]
  return [...new Set(ids.filter((id) => !isCoreCapability(id)))].map((id) =>
    lint(
      EEG_CAPABILITY_UNKNOWN,
      'warning',
      `"${capabilityName(id)}" is not one of the 32 Core Capabilities`,
    ),
  )
}

/** All evaluation-guide lints; empty for a scenario without an evaluation. */
export function lintEeg(s: Scenario): LintWarning[] {
  if (!hasEvaluation(s)) return []
  return [...lintObjectiveCapabilities(s), ...lintTasks(s), ...lintRows(s), ...lintCapabilities(s)]
}
