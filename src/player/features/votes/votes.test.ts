import { describe, expect, it } from 'vitest'
import type { Opened } from '../../../shared/live/codec'
import { applyClose, applyOpen, currentVote, mayVote, percent, type VoteMap } from './votes'

const ID = 'AAAAAAAAAAAAAAAAAAAAAA'
const options = [
  { id: 'o1', label: 'Shut down' },
  { id: 'o2', label: 'Keep running' },
]

const open = (over: Record<string, unknown> = {}) =>
  ({
    type: 'vote.open',
    payload: {
      voteId: ID,
      question: 'Shut down FIDS?',
      options,
      anonymous: true,
      allowChange: true,
      targets: ['all'],
      ...over,
    },
  }) as unknown as Opened<'vote.open'>

const close = (over: Record<string, unknown> = {}) =>
  ({
    type: 'vote.close',
    payload: {
      voteId: ID,
      status: 'closed',
      results: [
        { optionId: 'o1', count: 3 },
        { optionId: 'o2', count: 1 },
      ],
      voted: 4,
      eligible: 5,
      reveal: true,
      ...over,
    },
  }) as unknown as Opened<'vote.close'>

describe('mayVote', () => {
  const seat = { clientId: 'c', kind: 'player' as const, roleId: 'pio', teamId: 'comms' }
  it('lets a player seat vote when the vote is for everyone or names its role or team', () => {
    expect(mayVote({ targets: ['all'] }, seat)).toBe(true)
    expect(mayVote({ targets: ['role:pio'] }, seat)).toBe(true)
    expect(mayVote({ targets: ['team:comms'] }, seat)).toBe(true)
    expect(mayVote({ targets: ['role:ops'] }, seat)).toBe(false)
  })
  it('never gives evaluators or observers a ballot', () => {
    expect(mayVote({ targets: ['all'] }, { clientId: 'c', kind: 'evaluator' })).toBe(false)
    expect(mayVote({ targets: ['all'] }, { clientId: 'c', kind: 'observer' })).toBe(false)
    expect(mayVote({ targets: ['all'] }, undefined)).toBe(false)
  })
})

describe('applyOpen and applyClose', () => {
  it('records a new vote as open and a repeat as an update that keeps this device choice', () => {
    const first = applyOpen({}, open(), 10)
    expect(first).toMatchObject({ isNew: true, reopened: false })
    const mine: VoteMap = { [ID]: { ...first.votes[ID]!, mine: 'o2' } }
    const again = applyOpen(mine, open({ tally: [{ optionId: 'o1', count: 2 }] }), 20)
    expect(again).toMatchObject({ isNew: false, reopened: false })
    expect(again.votes[ID]).toMatchObject({
      mine: 'o2',
      openedAt: 10,
      tally: [{ optionId: 'o1', count: 2 }],
    })
  })

  it('freezes the result on close and reopens on a later vote.open', () => {
    const opened = applyOpen({}, open(), 10).votes
    const closed = applyClose(opened, close(), 30)
    expect(closed[ID]).toMatchObject({ status: 'closed', result: { voted: 4, revealed: true } })
    expect(applyOpen(closed, open(), 40)).toMatchObject({ reopened: true })
  })

  it('marks a ballot still waiting in the outbox as late when the vote closes', () => {
    const base = applyOpen({}, open(), 10).votes[ID]!
    const waiting: VoteMap = { [ID]: { ...base, mine: 'o1', ballotSent: false } }
    expect(applyClose(waiting, close(), 30)[ID]!.late).toBe(true)
    const sent: VoteMap = { [ID]: { ...base, mine: 'o1', ballotSent: true } }
    expect(applyClose(sent, close(), 30)[ID]!.late).toBe(false)
  })

  it('shows a result for a vote this device never saw open', () => {
    const closed = applyClose({}, close({ reveal: false }), 30)
    expect(closed[ID]).toMatchObject({ status: 'closed', result: { revealed: false } })
  })
})

describe('currentVote and percent', () => {
  it('prefers the open vote, else the newest', () => {
    const a = applyOpen({}, open(), 10).votes
    const b = applyOpen(a, open({ voteId: 'BBBBBBBBBBBBBBBBBBBBBB' }), 20).votes
    const closedB = applyClose(b, close({ voteId: 'BBBBBBBBBBBBBBBBBBBBBB' }), 25)
    expect(currentVote(closedB)?.voteId).toBe(ID)
    expect(currentVote({})).toBeUndefined()
  })
  it('rounds to a whole percent and is zero when nobody voted', () => {
    expect(percent(1, 3)).toBe(33)
    expect(percent(2, 3)).toBe(67)
    expect(percent(0, 0)).toBe(0)
  })
})
