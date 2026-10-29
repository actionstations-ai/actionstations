import { describe, expect, it } from 'vitest'
import { decisionText, foldedRole, tally, type Ballot } from './vote-tally'

const options = [
  { id: 'o1', label: 'Shut down now' },
  { id: 'o2', label: 'Keep running' },
  { id: 'o3', label: 'Shut down after the bank' },
]

const ballot = (optionId: string, roleId?: string, seq = 1): Ballot => ({
  optionId,
  ...(roleId ? { roleId } : {}),
  at: 1,
  seq,
})

describe('tally', () => {
  it('counts ballots per option in option order, with zero for unvoted options', () => {
    const r = tally({
      options,
      ballots: [ballot('o2'), ballot('o1'), ballot('o2')],
      k: 3,
      byRole: false,
    })
    expect(r.counts).toEqual([
      { optionId: 'o1', count: 1 },
      { optionId: 'o2', count: 2 },
      { optionId: 'o3', count: 0 },
    ])
    expect(r.voted).toBe(3)
    expect(r.byRole).toBeUndefined()
  })

  it('ignores a ballot for an option that does not exist', () => {
    const r = tally({ options, ballots: [ballot('zz'), ballot('o1')], k: 3, byRole: false })
    expect(r.voted).toBe(1)
  })

  it('never reports roles in an anonymous vote, even if ballots carried them', () => {
    const r = tally({ options, ballots: [ballot('o1', 'ops')], k: 3, byRole: false })
    expect(r.byRole).toBeUndefined()
  })

  it('folds a role with fewer than k devices into other and keeps the total', () => {
    const devicesByRole = new Map([
      ['ops', 4],
      ['pio', 2],
      ['asc', 1],
    ])
    const r = tally({
      options,
      ballots: [
        ballot('o1', 'ops'),
        ballot('o1', 'ops'),
        ballot('o2', 'ops'),
        ballot('o2', 'pio'),
        ballot('o1', 'pio'),
        ballot('o2', 'asc'),
      ],
      devicesByRole,
      k: 3,
      byRole: true,
    })
    expect(r.voted).toBe(6)
    expect(r.byRole).toEqual(
      expect.arrayContaining([
        { roleId: 'ops', optionId: 'o1', count: 2 },
        { roleId: 'ops', optionId: 'o2', count: 1 },
        { roleId: 'other', optionId: 'o2', count: 2 },
        { roleId: 'other', optionId: 'o1', count: 1 },
      ]),
    )
    expect(r.byRole!.some((x) => x.roleId === 'pio' || x.roleId === 'asc')).toBe(false)
    expect(r.byRole!.reduce((n, x) => n + x.count, 0)).toBe(6)
  })

  it('leaves out an other that would stand for a single device', () => {
    const r = tally({
      options,
      ballots: [ballot('o1', 'ops'), ballot('o1', 'ops'), ballot('o1', 'ops'), ballot('o2', 'asc')],
      devicesByRole: new Map([
        ['ops', 3],
        ['asc', 1],
      ]),
      k: 3,
      byRole: true,
    })
    expect(r.byRole!.every((x) => x.roleId === 'ops')).toBe(true)
    expect(r.voted).toBe(4)
  })
})

describe('foldedRole', () => {
  it('keeps a role at exactly k devices and folds one below', () => {
    const devices = new Map([
      ['a', 3],
      ['b', 2],
    ])
    expect(foldedRole('a', devices, 3)).toBe('a')
    expect(foldedRole('b', devices, 3)).toBe('other')
    expect(foldedRole('unknown', devices, 2)).toBe('other')
  })
})

describe('decisionText', () => {
  const counts = (a: number, b: number, c: number) => [
    { optionId: 'o1', count: a },
    { optionId: 'o2', count: b },
    { optionId: 'o3', count: c },
  ]
  it('names the leading option with its count of those who voted and the time', () => {
    expect(decisionText(options, counts(7, 3, 2), 12, '2:14')).toBe(
      'Shut down now (7 of 12), vote at 2:14',
    )
  })
  it('says so on a tie', () => {
    expect(decisionText(options, counts(3, 3, 0), 6, '1:05')).toBe(
      'Tied: Shut down now and Keep running (3 each of 6), vote at 1:05',
    )
  })
  it('says so when nobody voted', () => {
    expect(decisionText(options, counts(0, 0, 0), 0, '0:30')).toBe(
      'No votes were cast, vote at 0:30',
    )
  })
})
