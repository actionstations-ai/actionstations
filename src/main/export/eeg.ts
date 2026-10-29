// View model for the Exercise Evaluation Guide packet (#421): one EEG per capability in the
// HSEEP 2020 layout (capability, objectives, target, critical tasks table with observation
// keys and rating boxes, observation notes, analysis). Observations never go into the packet:
// it is the blank form evaluators fill in. Strings stay raw; the template escapes them.
import { capabilityName, coreCapability, MISSION_AREA_LABELS } from '@shared/core-capabilities'
import type { Citation, CriticalTask, Scenario } from '@shared/schemas'
import type { ExportModel } from './model'
import { scenarioHeading, titleFacts } from './views'

/** "TIRP › Section 13 › 13.6 Scenario C…" → "TIRP 13.6 Scenario C…"; the page when known. */
export function citationSource(c: Citation): string {
  const parts = c.headingPath.split('›').map((p) => p.trim())
  const doc = parts[0] ?? c.documentTitle
  const section = parts.length > 1 ? parts[parts.length - 1]! : ''
  const page = c.page ? ` (p. ${c.page})` : ''
  return `${doc}${section ? ` ${section}` : ''}${page}`
}

function roleName(s: Scenario, roleId: string | undefined): string {
  if (!roleId) return ''
  const r = s.roles.find((x) => x.id === roleId)
  return r ? r.abbreviation || r.name : roleId
}

/** The rows a task is observed on, with their times, for the Observation Keys column. */
export function observationKeys(s: Scenario, t: CriticalTask): string {
  return t.rowIds
    .map((id) => {
      const row = s.msel.find((r) => r.id === id)
      return row ? `${id} (${row.time})` : id
    })
    .join(', ')
}

/** Blank copies of the packet to print: one per evaluator seat. */
export const evaluatorCopies = (model: Pick<ExportModel, 'evaluatorCopies'>): number =>
  Math.max(1, model.evaluatorCopies ?? 1)

/** The packet's id prefix for copy `n` of `of`, so ids stay unique when it is printed twice. */
export const copyPrefix = (prefix: string, n: number, of: number): string =>
  of > 1 ? `${prefix}c${n}-` : prefix

/** `copy` names the evaluator seat of a numbered copy ("Evaluator 2"); a single copy has a blank line. */
export function eegView(model: ExportModel, prefix = '', copy?: number) {
  const s = model.scenario
  const objectiveName = (id: string): string => {
    const o = s.objectives.find((x) => x.id === id)
    return o ? o.name || o.text : id
  }
  return {
    prefix,
    title: {
      id: `${prefix}eeg-title`,
      eyebrow: 'Exercise Evaluation Guides (EEG)',
      heading: scenarioHeading(model),
      sub: s.subtitle ?? '',
      facts: titleFacts(model, [
        ['Exercise date', '____________'],
        ['Evaluator', copy ? `Evaluator ${copy}` : '____________'],
      ]),
    },
    intro: {
      count: s.evaluation.eegs.length,
      objectives: s.objectives.map((o) => ({
        name: o.name,
        text: o.text,
        capabilities: s.evaluation.objectiveCapabilities
          .filter((p) => p.objectiveId === o.id)
          .map((p) => capabilityName(p.capability))
          .join(', '),
      })),
    },
    eegs: s.evaluation.eegs.map((e, i) => ({
      index: i + 1,
      id: `${prefix}eeg-${i}`,
      capability: capabilityName(e.capability),
      areas: (coreCapability(e.capability)?.areas ?? [])
        .map((a) => MISSION_AREA_LABELS[a])
        .join(', '),
      definition: coreCapability(e.capability)?.definition ?? '',
      objectives: e.objectiveRefs.map(objectiveName),
      target: e.target,
      tasks: e.criticalTasks.map((t) => ({
        id: t.id,
        task: t.task,
        timing: t.timing ?? '',
        source: citationSource(t.citation),
        expectedBy: roleName(s, t.expectedBy),
        keys: observationKeys(s, t),
      })),
    })),
    endNote: 'End of Exercise Evaluation Guides',
  }
}
export type EegView = ReturnType<typeof eegView>
