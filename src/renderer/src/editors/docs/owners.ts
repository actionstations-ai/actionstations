import type { Scenario, ScenarioDocKind, Stage } from '@shared/schemas/scenario'

export const DOC_LABELS: Record<ScenarioDocKind, string> = {
  handbook: 'Controller handbook',
  briefing: 'Player briefing',
  hotwash: 'Hot wash guide',
  overview: 'MSEL document',
  handouts: 'Player handouts',
  controller_handouts: 'Controller materials',
}
export const DOC_ORDER: ScenarioDocKind[] = [
  'handbook',
  'briefing',
  'hotwash',
  'overview',
  'handouts',
  'controller_handouts',
]

/** The generation stage that writes each document; handouts are written by hand only. */
export const DOC_STAGE: Partial<Record<ScenarioDocKind, Stage>> = {
  handbook: 'controller_handbook',
  briefing: 'player_briefing',
  hotwash: 'hotwash',
  overview: 'scenario_overview',
}

export type StructuredPart =
  | 'overview'
  | 'objectivesRoles'
  | 'rubric'
  | 'evaluation'
  | 'hotwash'
  | 'simcell'
  | 'sitman'

/** The generation stage that writes each structured part of scenario.json. */
export const PART_STAGE: Record<StructuredPart, Stage> = {
  overview: 'scenario_overview',
  objectivesRoles: 'objectives_roles',
  rubric: 'rubric',
  evaluation: 'eeg',
  hotwash: 'hotwash',
  simcell: 'controller_handbook',
  sitman: 'sitman',
}

/** When the stage last finished successfully (ISO), or undefined. */
export function lastGenerated(scenario: Scenario, stage: Stage | undefined): string | undefined {
  if (!stage) return undefined
  return scenario.provenance
    .filter((r) => r.stage === stage && r.status === 'ok' && r.finishedAt)
    .map((r) => r.finishedAt!)
    .sort()
    .at(-1)
}

/** A short, path-safe id for a new list item (SafeId). */
export const newItemId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
