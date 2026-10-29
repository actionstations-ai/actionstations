// Types for scripts/bench/score/reliability.mjs.
import type { ScenarioLike, StageRunLike } from '../types.d.mts'
export const PIPELINE_STAGES: string[]
export const NO_JSON: string
export function reliability(scenario: Pick<ScenarioLike, 'provenance' | 'phases' | 'warnings'>): {
  score: number
  successRate: number
  stagesExpected: number
  stagesOk: number
  stagesFailed: number
  repairRounds: number
  noJson: number
  droppedCitations: number
}
export function tokensPerSecond(runs: StageRunLike[]): number | undefined
export function largestPrompt(runs: StageRunLike[]): number
