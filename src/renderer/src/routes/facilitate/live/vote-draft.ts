// What the vote form holds while it is being filled in, and the definition it makes.
import { VOTE_DEFAULT_K, VoteDefinition } from '@shared/schemas/live'
import { VOTES } from './vote-strings'

export interface Draft {
  source: string
  question: string
  options: string
  anonymous: boolean
  targets: string[]
  allowChange: boolean
  askWhy: boolean
  liveResults: boolean
  duration: string
  k: number
  /** Set when the form was filled from a branch decision, so the vote answers it. */
  optionIds: string[]
  decisionId: string
}

export const BLANK: Draft = {
  source: '',
  question: '',
  options: '',
  anonymous: true,
  targets: ['all'],
  allowChange: true,
  askWhy: false,
  liveResults: false,
  duration: '',
  k: VOTE_DEFAULT_K,
  optionIds: [],
  decisionId: '',
}

/** The definition the form describes, or undefined while it is incomplete. */
export function definitionOf(d: Draft): VoteDefinition | undefined {
  const parsed = VoteDefinition.safeParse({
    question: d.question,
    options: d.options
      .split('\n')
      .map((o) => o.trim())
      .filter(Boolean),
    anonymous: d.anonymous,
    targets: d.targets,
    allowChange: d.allowChange,
    liveResults: d.liveResults,
    k: d.k,
    ...(d.decisionId && d.optionIds.length
      ? { optionIds: d.optionIds, decisionId: d.decisionId }
      : {}),
    ...(d.askWhy ? { rationalePrompt: VOTES.whyPrompt } : {}),
    ...(d.duration ? { durationSec: Number(d.duration) } : {}),
  })
  return parsed.success ? parsed.data : undefined
}
