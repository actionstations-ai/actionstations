// The sentence a micro-drill run shows so the hint rule is never hidden (#437, FR-11).
import type { MicroDrillRun } from '@shared/schemas'

const WHEN = {
  first_miss:
    'Hints are offered after an answer that misses a point. You can also ask for one at any time.',
  second_miss:
    'Hints are offered after your second answer that misses a point, because you needed little help last time. You can still ask for one at any time.',
} as const

export function ruleText(run: Pick<MicroDrillRun, 'hintRule' | 'withdrawnLevel3'>): string {
  const n = run.withdrawnLevel3.length
  const level3 = n
    ? ` For ${n} ${n === 1 ? 'question' : 'questions'} the plan quote (Level 3) is not offered, because you answered ${n === 1 ? 'it' : 'them'} without hints in your last two runs. You can still open the plan.`
    : ''
  return WHEN[run.hintRule] + level3
}
