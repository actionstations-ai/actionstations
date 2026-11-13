/* eslint-disable @typescript-eslint/no-explicit-any -- loose types for the scripts under test */
// Types for scripts/bench/mini/budget.mjs (tests/scripts/bench-mini.test.ts).
export const PIPELINE_STAGES: string[]
export function scenarioBudget(opts?: { phases?: number; root?: string; scenarios?: any[] }): {
  phases: number
  modelStages: number
  inputTokens: number
  outputTokens: number
  stages: any[]
}
export function bundledScenarios(root?: string): any[]
/** True when a hosted model (Claude) drafted the scenario; such examples are left out of the budget. */
export function draftedInTheCloud(scenario: {
  provenance: { model?: string; providerRef?: { model?: string } }[]
}): boolean
