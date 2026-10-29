// Decision-point voting (spec 0414) as the input of a branch decision (spec 0430): a decision
// row opens a vote whose option ids are the decision's option ids, and the vote's tally is the
// decision's tally. Pure, so the Decisions tab and the tests share it.
import type { VoteDefinition, VoteView } from '../schemas/live'
import type { Decision } from '../schemas/scenario'
import type { DecisionTallyInput, DecisionTallySource } from './input'

/** The vote that puts a decision to the room, with the decision's own option ids. */
export function voteForDecision(
  decision: Decision,
): Pick<
  VoteDefinition,
  'question' | 'options' | 'optionIds' | 'decisionId' | 'anonymous' | 'targets'
> {
  return {
    question: decision.question.slice(0, 300),
    options: decision.options.map((o) => o.label),
    optionIds: decision.options.map((o) => o.id),
    decisionId: decision.id,
    anonymous: decision.mode === 'anonymous',
    targets: decision.votingRoleIds.length
      ? decision.votingRoleIds.map((id) => `role:${id}`)
      : ['all'],
  }
}

/** The tally of one vote as a decision's input. */
export function tallyInputOf(vote: VoteView): DecisionTallyInput | undefined {
  if (!vote.decisionId) return undefined
  return {
    decisionId: vote.decisionId,
    tally: Object.fromEntries(vote.options.map((o) => [o.id, o.count])),
    voteId: vote.voteId,
    eligible: vote.eligible,
  }
}

/**
 * A source of tallies from the session's votes: the newest vote for the decision, as it stands
 * or as it closed. An interrupted vote still counts what was cast. Undefined with no vote.
 */
export function tallySourceFromVotes(votes: readonly VoteView[]): DecisionTallySource {
  return (decisionId) => {
    const newest = votes
      .filter((v) => v.decisionId === decisionId)
      .sort((a, b) => b.openedAt - a.openedAt)[0]
    return newest ? tallyInputOf(newest) : undefined
  }
}
