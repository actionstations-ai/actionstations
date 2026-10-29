// How a branch decision receives votes. Decision-point voting (spec 0414) feeds a decision
// through this interface; until it does, the facilitator enters a show of hands.
export interface DecisionTallyInput {
  decisionId: string
  /** Votes by option id, as the vote closed or stands now. */
  tally: Record<string, number>
  /** The vote this tally came from, when there was one. */
  voteId?: string
  /** People who could vote. */
  eligible?: number
}

/** A source of live tallies (voting from players' devices). Returns undefined with no vote. */
export type DecisionTallySource = (decisionId: string) => DecisionTallyInput | undefined
