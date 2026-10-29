// Types for scripts/bench/score/composite.mjs.
import type { Planted } from '../defects.d.mts'
import type {
  CaseScore,
  Gold,
  GroundingLike,
  IdeaLike,
  ScenarioLike,
  Suite,
  WarningLike,
} from '../types.d.mts'
export const SCORING_VERSION: number
export function draftingCase(input: {
  scenario: ScenarioLike
  lints: WarningLike[]
  gold: Gold
  suite: Suite
  grounding?: GroundingLike
}): CaseScore & { reliability: { successRate: number } }
export function ideationCase(input: {
  ideas: IdeaLike[]
  dropped: number
  suite: Suite
  grounding?: Record<string, { label: string } | undefined>
}): CaseScore
export function critiqueCase(input: {
  notes: Partial<WarningLike>[]
  planted: Planted[]
  lints: Partial<WarningLike>[]
  rowCount: number
  suite: Suite
}): CaseScore
export interface TaskResult {
  task: string
  score: number
  parts: Record<string, number>
  details: Record<string, unknown>
  wallSeconds: number
  outputTokensPerSecond?: number
}
export function aggregateTask(
  task: string,
  cases: (CaseScore & { caseId: string })[],
  timing?: { wallSeconds?: number; outputTokensPerSecond?: number },
): TaskResult
export function overallScore(
  tasks: { task: string; score: number }[],
  weights: Record<string, number>,
): number
export function summarizeRepeats(
  repeats: { overall: number; tasks: { task: string; score: number }[] }[],
  reliabilities: number[],
  unstableRange: number,
): {
  median: { overall: number; tasks: Record<string, number>; draftingReliability: number }
  range: { overall: [number, number] }
  unstable: boolean
}
