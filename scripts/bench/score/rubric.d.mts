// Types for scripts/bench/score/rubric.mjs.
import type { Gold, ScenarioLike, WarningLike } from '../types.d.mts'
export const RUBRIC_ITEMS: string[]
export function paceOk(
  scenario: ScenarioLike,
  gold: Gold,
  band: [number, number],
): { pass: boolean; rate: number }
export function tagMixOk(scenario: ScenarioLike, gold: Gold): { pass: boolean; missing: string[] }
export function decisionPhaseOk(scenario: ScenarioLike): boolean
export function startEndOk(msel: ScenarioLike['msel']): boolean
export function roleGaps(scenario: ScenarioLike): string[]
export function rubricScore(
  scenario: ScenarioLike,
  lints: Pick<WarningLike, 'code'>[],
  gold: Gold,
  weights: Record<string, number>,
  band: [number, number],
): {
  score: number
  items: Record<string, boolean>
  rowsPerHour: number
  missingTagGroups: string[]
  roleGaps: number
}
