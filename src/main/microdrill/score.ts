// Scoring for micro-drills (#437, FR-12). Pure. A step's score is the share of its expected
// points covered across the answers given (partly covered counts half), reduced by the highest
// hint level used: Level 1 none, Level 2 a quarter, Level 3 a half. It is shown as covered
// points and hints used, never as pass or fail.
import type { HintLevel, MicroDrillRunStep, MicroDrillStep } from '@shared/schemas'

export const HINT_REDUCTION: Record<HintLevel, number> = { 1: 0, 2: 0.25, 3: 0.5 }

export interface StepCoverage {
  covered: string[]
  partial: string[]
  missing: string[]
}

/** Points covered by any answer to the step; a point covered once stays covered. */
export function coverageOf(
  step: Pick<MicroDrillStep, 'expectedPoints'>,
  attempts: MicroDrillRunStep['attempts'],
): StepCoverage {
  const covered = new Set(attempts.flatMap((a) => a.covered))
  const partial = new Set(attempts.flatMap((a) => a.partial).filter((id) => !covered.has(id)))
  const ids = step.expectedPoints.map((p) => p.id)
  return {
    covered: ids.filter((id) => covered.has(id)),
    partial: ids.filter((id) => partial.has(id)),
    missing: ids.filter((id) => !covered.has(id) && !partial.has(id)),
  }
}

export function stepScore(
  step: Pick<MicroDrillStep, 'expectedPoints'>,
  attempts: MicroDrillRunStep['attempts'],
  hintsUsed: readonly HintLevel[],
): number {
  const total = step.expectedPoints.length
  if (!total) return 0
  const c = coverageOf(step, attempts)
  const base = (c.covered.length + c.partial.length / 2) / total
  const top = hintsUsed.length ? (Math.max(...hintsUsed) as HintLevel) : undefined
  const reduced = base * (1 - (top ? HINT_REDUCTION[top] : 0))
  return Math.round(reduced * 1000) / 1000
}

/** The share of the drill's points covered: the mean of the step scores; unanswered steps count 0. */
export function runCoverage(steps: Pick<MicroDrillRunStep, 'score'>[], stepCount: number): number {
  if (!stepCount) return 0
  const sum = steps.reduce((n, s) => n + s.score, 0)
  return Math.round((sum / stepCount) * 1000) / 1000
}
