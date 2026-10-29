// Reliability of the drafting pipeline (#434, FR-9): how many stages succeeded, repair rounds
// used, replies with no JSON at all and citation keys the mappers dropped.
import { droppedKeys, share } from './util.mjs'

/** src/main/generate/engine.ts PIPELINE_STAGES (a unit test keeps the two in step). */
export const PIPELINE_STAGES = [
  'scenario_overview',
  'objectives_roles',
  'phase_plan',
  'msel_phase',
  'controller_handbook',
  'rubric',
  'eeg',
  'player_briefing',
  'hotwash',
  'sitman',
  'critique',
]

/** The engine's StageFailure text for a reply without JSON (src/main/generate/stage.ts). */
export const NO_JSON = 'no JSON object found in the reply'

/**
 * Measures from a drafted scenario's provenance and warnings. Every pipeline stage that has
 * no successful run counts as failed: a stage the engine never reached after a failure is as
 * missing as one that failed.
 */
export function reliability(scenario) {
  const runs = scenario.provenance.filter((r) => PIPELINE_STAGES.includes(r.stage))
  const phaseCount = Math.max(1, scenario.phases.length)
  const expected = PIPELINE_STAGES.length - 1 + phaseCount
  const ok = runs.filter((r) => r.status === 'ok' || r.status === 'stale').length
  const dropped = scenario.warnings
    .filter((w) => w.code === 'CITATION_DROPPED')
    .reduce((n, w) => n + droppedKeys(w.message).length, 0)
  const successRate = share(Math.min(ok, expected), expected)
  return {
    score: successRate * 100,
    successRate,
    stagesExpected: expected,
    stagesOk: ok,
    stagesFailed: runs.filter((r) => r.status === 'error').length,
    repairRounds: runs.reduce((n, r) => n + (r.repairAttempts ?? 0), 0),
    noJson: runs.filter((r) => r.status === 'error' && (r.error ?? '').includes(NO_JSON)).length,
    droppedCitations: dropped,
  }
}

/** Output tokens per second over the stage runs that report usage and both times. */
export function tokensPerSecond(runs) {
  let tokens = 0
  let ms = 0
  for (const r of runs) {
    if (!r.outputTokens || !r.finishedAt) continue
    const d = Date.parse(r.finishedAt) - Date.parse(r.startedAt)
    if (!(d > 0)) continue
    tokens += r.outputTokens
    ms += d
  }
  return ms > 0 ? tokens / (ms / 1000) : undefined
}

/** Prompt tokens of the largest request among `runs`. */
export const largestPrompt = (runs) => Math.max(0, ...runs.map((r) => r.inputTokens ?? 0))
