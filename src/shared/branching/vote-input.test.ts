import { describe, expect, it } from 'vitest'
import type { VoteView } from '../schemas/live'
import { Decision } from '../schemas/scenario'
import { decide } from './decide'
import { tallyInputOf, tallySourceFromVotes, voteForDecision } from './vote-input'

const decision = Decision.parse({
  id: 'd1',
  question: 'Pay the ransom or rebuild?',
  options: [
    { id: 'pay', label: 'Pay' },
    { id: 'rebuild', label: 'Rebuild' },
  ],
  mode: 'by_role',
  rule: { kind: 'majority' },
  defaultOptionId: 'rebuild',
  votingRoleIds: ['ops', 'it'],
})

const view = (over: Partial<VoteView> = {}): VoteView => ({
  voteId: 'AAAAAAAAAAAAAAAAAAAAAA',
  decisionId: 'd1',
  question: decision.question,
  options: [
    { id: 'pay', label: 'Pay', count: 4 },
    { id: 'rebuild', label: 'Rebuild', count: 1 },
  ],
  anonymous: false,
  status: 'closed',
  openedAt: 100,
  voted: 5,
  eligible: 6,
  liveResults: false,
  recorded: false,
  canReopen: false,
  ...over,
})

describe('voteForDecision', () => {
  it('uses the decision options and ids, its mode and its voting roles', () => {
    expect(voteForDecision(decision)).toEqual({
      question: 'Pay the ransom or rebuild?',
      options: ['Pay', 'Rebuild'],
      optionIds: ['pay', 'rebuild'],
      decisionId: 'd1',
      anonymous: false,
      targets: ['role:ops', 'role:it'],
    })
  })
  it('puts a decision with no voting roles to everyone, anonymously', () => {
    const open = Decision.parse({ ...decision, mode: 'anonymous', votingRoleIds: [] })
    expect(voteForDecision(open)).toMatchObject({ anonymous: true, targets: ['all'] })
  })
})

describe('a closed vote feeding a branch decision', () => {
  it('gives decide() the tally and the rule picks the option', () => {
    const input = tallySourceFromVotes([view()])('d1')!
    expect(input).toEqual({
      decisionId: 'd1',
      tally: { pay: 4, rebuild: 1 },
      voteId: 'AAAAAAAAAAAAAAAAAAAAAA',
      eligible: 6,
    })
    expect(decide(decision, input)).toEqual({ optionId: 'pay', by: 'vote' })
  })

  it('falls back to the default option on a split the rule does not accept', () => {
    const tied = view({
      options: [
        { id: 'pay', label: 'Pay', count: 2 },
        { id: 'rebuild', label: 'Rebuild', count: 2 },
      ],
    })
    expect(decide(decision, tallyInputOf(tied)!)).toEqual({ optionId: 'rebuild', by: 'vote' })
  })

  it('uses the newest vote for the decision and ignores other decisions and ad hoc votes', () => {
    const older = view({ openedAt: 1, options: [{ id: 'pay', label: 'Pay', count: 0 }] })
    const other = view({ decisionId: 'd2', openedAt: 500 })
    const adHoc = view({ openedAt: 900 })
    delete (adHoc as Partial<VoteView>).decisionId
    const source = tallySourceFromVotes([older, other, adHoc, view()])
    expect(source('d1')!.tally).toEqual({ pay: 4, rebuild: 1 })
    expect(source('d9')).toBeUndefined()
  })
})
