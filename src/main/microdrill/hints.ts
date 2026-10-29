// Hint rules and fading for micro-drills (#437, FR-10, FR-11). Pure: the hint text itself is
// prewritten in the drill; this module only decides when a hint is offered and which levels a
// repeat run still gets, from what earlier runs of the same participant label needed.
import type { HintLevel, MicroDrillRun, MicroDrillRunStep } from '@shared/schemas'

export type HintRule = MicroDrillRun['hintRule']

/** What one participant label needed on one step in the runs so far. */
export interface StepHistory {
  runs: number
  /** Highest hint level used in the latest run (0 = none). */
  lastHintMax: number
  /** Consecutive latest runs answered without any hint. */
  cleanRuns: number
}

/** participant label → step id → history. */
export type AnnexHistory = Record<string, Record<string, StepHistory>>

/** Runs without a hint before a step's Level 3 hint is withdrawn. */
export const CLEAN_RUNS_TO_WITHDRAW = 2

export interface HintDecision {
  rule: HintRule
  withdrawnLevel3: string[]
}

/**
 * The rule for a run. Hints wait for a second missed answer when every participant has run this
 * annex before and nobody needed a Level 3 hint last time; a Level 3 hint is withdrawn from a
 * step every participant answered without hints in the two latest runs.
 */
export function decideHints(
  labels: string[],
  stepIds: string[],
  history: AnnexHistory,
): HintDecision {
  const seen = (label: string): StepHistory[] =>
    Object.values(history[label] ?? {}).filter((h) => h.runs > 0)
  const everyoneRanBefore = labels.length > 0 && labels.every((l) => seen(l).length > 0)
  const needed3 = labels.some((l) => seen(l).some((h) => h.lastHintMax >= 3))
  const withdrawnLevel3 = stepIds.filter((id) =>
    labels.every((l) => (history[l]?.[id]?.cleanRuns ?? 0) >= CLEAN_RUNS_TO_WITHDRAW),
  )
  return {
    rule: everyoneRanBefore && !needed3 ? 'second_miss' : 'first_miss',
    withdrawnLevel3,
  }
}

const missesPoints = (a: MicroDrillRunStep['attempts'][number]): boolean =>
  a.missing.length > 0 || a.partial.length > 0

/** The next hint level this step has not used, or null when all three are used. */
export function nextLevel(used: readonly HintLevel[]): HintLevel | null {
  const top = used.length ? Math.max(...used) : 0
  return top >= 3 ? null : ((top + 1) as HintLevel)
}

/** Whether Level 3 can be shown for this step under the fading rule. */
export const level3Available = (stepId: string, withdrawn: readonly string[]): boolean =>
  !withdrawn.includes(stepId)

/**
 * The hint level to offer after the latest answer, or null: the answer misses a point, enough
 * answers missed for the rule, and a next level exists that is not withdrawn.
 */
export function hintOffer(
  step: MicroDrillRunStep,
  rule: HintRule,
  withdrawn: readonly string[],
): HintLevel | null {
  const last = step.attempts.at(-1)
  if (!last || !missesPoints(last)) return null
  const misses = step.attempts.filter(missesPoints).length
  if (misses < (rule === 'second_miss' ? 2 : 1)) return null
  const next = nextLevel(step.hintsUsed)
  if (next === 3 && !level3Available(step.stepId, withdrawn)) return null
  return next
}

/** History after a finished run: one entry per label and step. */
export function updateHistory(
  history: AnnexHistory,
  labels: string[],
  steps: Pick<MicroDrillRunStep, 'stepId' | 'hintsUsed' | 'attempts'>[],
): AnnexHistory {
  const next: AnnexHistory = structuredClone(history)
  for (const label of labels) {
    const mine = (next[label] ??= {})
    for (const s of steps) {
      if (!s.attempts.length) continue
      const before = mine[s.stepId] ?? { runs: 0, lastHintMax: 0, cleanRuns: 0 }
      const top = s.hintsUsed.length ? Math.max(...s.hintsUsed) : 0
      mine[s.stepId] = {
        runs: before.runs + 1,
        lastHintMax: top,
        cleanRuns: top === 0 ? before.cleanRuns + 1 : 0,
      }
    }
  }
  return next
}
