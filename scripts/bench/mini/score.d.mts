/* eslint-disable @typescript-eslint/no-explicit-any -- loose types for the scripts under test */
// Types for scripts/bench/mini/score.mjs (tests/scripts/bench-mini.test.ts).
export interface Observation {
  ok: boolean
  seconds: number
  inputTokens?: number
  outputTokens?: number
  repairAttempts?: number
  lengthRetries?: number
  error?: string
  promptHash?: string
  stage?: string
}
export interface Criterion {
  id: string
  label: string
  met: boolean
  /** What the criterion earned, 0 to 1; absent in run files saved before partial credit. */
  credit?: number
}
export interface ProbeResult {
  score: number
  ok: boolean
  firstTry: boolean
  criteria: Criterion[]
  metrics: Record<string, number>
  reason?: string
  failure?: { kind: string; detail: string; tail?: string }
}
export interface Range {
  value: number
  min: number
  max: number
}
export function stretchPhase(scenario: any, phaseId: string, minutes: number): any
export function phaseView(scenario: any, phaseId: string): any
export function classifyFailure(error?: string): { kind: string; detail: string; tail?: string }
export function firstTry(obs: Observation): boolean
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
export function qualityOf(probes: Record<string, any>): {
  score: number
  met: number
  total: number
}
export function damageOf(probes: Record<string, any>): number | undefined
export function rangeOf(values: (number | undefined)[], digits?: number): Range | undefined
export function rangesOverlap(a: Range, b: Range): boolean
export function compareRanges(a: Range, b: Range): 'a' | 'b' | 'tie'
export function repairRate(probes: Record<string, any>): number
export function callRate(probes: Record<string, any>): number
export function rateBounds(observations: any[]): {
  promptTokensPerSecond?: number
  outputTokensPerSecond?: number
}
export function outputSpeed(observations: Observation[]): number | undefined
export function fitSpeeds(
  observations: any[],
):
  | { promptTokensPerSecond: number; outputTokensPerSecond: number; method: 'fit' | 'pooled' }
  | undefined
export function draftMinutes(speeds: any, budget: any): number | undefined
export function speedOf(input: { calls: any[]; budget: any }): any
export function scoreRepeat(input: { probes: Record<string, any>; calls: any[]; suite: any }): any
export function miniResult(input: { repeats: any[]; suite: any }): any
export function runObservation(scenario: any, stage: string, itemId?: string): Observation

export const MINI_SCORING_VERSION: number
export const CREDIT_RULES: Record<string, number>
export function ramp(value: number, zero: number, full: number): number
export function creditOf(c: Criterion): number
export function phaseShape(view: any, gold: any, q: any): any
export function longContextMeasures(input: any): any
export function longContextCredits(m: any, q: any, gold: any): Record<string, number>
export function longLabels(q: any): Record<string, string>
export function handbookCriteria(m: any, q: any): Criterion[]
export function regradeProbe(
  key: string,
  probe: ProbeResult,
  ctx: { suite: any; gold: any; measured?: any },
): ProbeResult
