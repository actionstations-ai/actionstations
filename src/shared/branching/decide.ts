// The rule table for a branch decision (spec 0430 FR-4). Pure: no randomness, no I/O. Ties and
// missing input always fall back to the decision's default option, so the same tally gives the
// same answer in every run.
import type { Decision } from '../schemas/scenario'

export interface DecisionInput {
  /** Votes by option id. Ids that are not options of the decision are ignored. */
  tally: Record<string, number>
}

export interface DecisionOutcome {
  optionId: string
  /**
   * 'vote' when the rule picked from the tally (or fell back to the default for want of a
   * result); 'controller' when the controller picked, or the rule is `controller` (default
   * option when nobody has picked yet).
   */
  by: 'vote' | 'controller'
}

/** Votes for each option of the decision, in option order; unknown ids and bad counts dropped. */
export function countVotes(
  decision: Decision,
  tally: Record<string, number>,
): { optionId: string; count: number }[] {
  return decision.options.map((o) => {
    const n = tally[o.id]
    return {
      optionId: o.id,
      count: n !== undefined && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0,
    }
  })
}

const sum = (counts: { count: number }[]) => counts.reduce((a, c) => a + c.count, 0)

function byTally(decision: Decision, tally: Record<string, number>): string {
  const counts = countVotes(decision, tally)
  const cast = sum(counts)
  const fallback = decision.defaultOptionId
  if (cast === 0) return fallback
  const rule = decision.rule
  const top = Math.max(...counts.map((c) => c.count))
  const leaders = counts.filter((c) => c.count === top)
  switch (rule.kind) {
    case 'plurality':
      return leaders.length === 1 ? leaders[0]!.optionId : fallback
    case 'majority':
      return leaders.length === 1 && top * 2 > cast ? leaders[0]!.optionId : fallback
    case 'threshold': {
      const mine = counts.find((c) => c.optionId === rule.optionId)
      return mine && mine.count / cast >= rule.minShare ? mine.optionId : fallback
    }
    case 'unanimous':
      return leaders.length === 1 && top === cast ? leaders[0]!.optionId : fallback
    case 'controller':
      return fallback
  }
}

/**
 * Applies the decision's rule to a tally. A valid `controllerChoice` always wins (the
 * controller may close any decision by hand). Under the `controller` rule the vote is advisory
 * and, with no choice yet, the default option is returned.
 */
export function decide(
  decision: Decision,
  input: DecisionInput,
  controllerChoice?: string,
): DecisionOutcome {
  if (controllerChoice && decision.options.some((o) => o.id === controllerChoice))
    return { optionId: controllerChoice, by: 'controller' }
  if (decision.rule.kind === 'controller')
    return { optionId: decision.defaultOptionId, by: 'controller' }
  return { optionId: byTally(decision, input.tally), by: 'vote' }
}

/** Total of the votes that count (options of this decision only). */
export const votesCast = (decision: Decision, tally: Record<string, number>): number =>
  sum(countVotes(decision, tally))
