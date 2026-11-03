/* eslint-disable @typescript-eslint/no-explicit-any -- loose types for the scripts under test */
// Types for scripts/bench/mini/score.mjs (tests/scripts/bench-mini.test.ts).
export interface Observation {
  ok: boolean
  seconds: number
  inputTokens?: number
  outputTokens?: number
  repairAttempts?: number
  error?: string
  capped?: boolean
  promptHash?: string
  stage?: string
}
export interface ProbeResult {
  score: number
  ok: boolean
  metrics: Record<string, number>
  reason?: string
}
export function phaseView(scenario: any, phaseId: string): any
export function scoreFormat(obs: Observation): ProbeResult
export function scoreLongContext(input: {
  obs: Observation
  scenario?: any
  phaseId?: string
  grounding?: any
  suite?: any
  gold?: any
}): ProbeResult
export function repetitionShare(text: string): number
export function scoreLongOutput(input: {
  obs: Observation
  handbookMd?: string
  simcellScripts?: number
  suite?: any
}): ProbeResult
export function scoreReview(input: { obs: Observation; critique?: any; what?: string }): ProbeResult
export function outputSpeed(observations: Observation[]): number | undefined
export function speedOf(input: { calls: Observation[]; longPrompt?: Observation }): {
  outputTokensPerSecond?: number
  longPromptTokens?: number
  longPromptSeconds?: number
  totalSeconds: number
}
export function miniScore(
  probes: Record<string, { score: number }>,
  weights: Record<string, number>,
): number
export function runObservation(scenario: any, stage: string, itemId?: string): Observation
