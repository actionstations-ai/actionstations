import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VoteDefinition, type SessionLogInput } from '@shared/schemas/live'
import { REOPEN_WINDOW_MS, TALLY_BATCH_MS, Votes, type VoteSeat } from './votes'

const LABELS: Record<string, string> = { ops: 'Operations', pio: 'PIO', asc: 'ASC' }

function seat(id: string, roleId: string, extra: Partial<VoteSeat> = {}): VoteSeat {
  return {
    clientId: id,
    kind: 'player',
    roleId,
    label: LABELS[roleId] ?? roleId,
    online: true,
    ...extra,
  }
}

function room() {
  const sent: { type: string; to: string; payload: Record<string, unknown> }[] = []
  const logged: SessionLogInput[] = []
  let seats: VoteSeat[] = []
  let clock = 1_000_000
  const closed: unknown[] = []
  const votes = new Votes({
    send: async (type, to, payload) => void sent.push({ type, to, payload }),
    log: { append: async (e) => void logged.push(e) },
    seats: () => seats,
    roleLabel: (id) => LABELS[id] ?? id,
    now: () => clock,
    changed: () => undefined,
    exerciseTime: async () => '2:14',
    onClosed: (r) => closed.push(r),
  })
  return {
    votes,
    sent,
    logged,
    closed,
    setSeats: (s: VoteSeat[]) => (seats = s),
    advance: (ms: number) => (clock += ms),
    kinds: () => logged.map((e) => e.kind),
  }
}

const def = (over: Partial<VoteDefinition> = {}): VoteDefinition =>
  VoteDefinition.parse({ question: 'Shut down FIDS?', options: ['Yes', 'No', 'Later'], ...over })

const cast = (
  r: ReturnType<typeof room>,
  voteId: string,
  from: string,
  optionId: string,
  seq = 1,
  rationale?: string,
) => r.votes.onBallot(from, seq, { voteId, optionId, ...(rationale ? { rationale } : {}) })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('opening a vote', () => {
  it('sends vote.open to each target, logs it, and refuses a second open vote', async () => {
    const r = room()
    r.setSeats([seat('a', 'ops')])
    const v = await r.votes.open(def({ targets: ['role:ops', 'role:pio'] }), { rowId: 'I-14' })
    expect(r.sent.filter((s) => s.type === 'vote.open').map((s) => s.to)).toEqual([
      'role:ops',
      'role:pio',
    ])
    expect(v).toMatchObject({ status: 'open', rowId: 'I-14', voted: 0 })
    expect(v.options.map((o) => o.id)).toEqual(['o1', 'o2', 'o3'])
    expect(r.logged[0]).toMatchObject({ kind: 'vote.open', ref: { rowId: 'I-14' } })
    await expect(r.votes.open(def())).rejects.toThrow(/already open/)
  })

  it('tells evaluators, observers and players out of scope that a vote is in progress', async () => {
    const r = room()
    r.setSeats([seat('a', 'ops'), seat('b', 'pio')])
    await r.votes.open(def({ targets: ['role:ops'] }))
    const notices = r.sent.filter((s) => s.type === 'controller.notice')
    expect(notices.map((n) => n.to).sort()).toEqual(
      ['role:evaluators', 'role:observers', `client:b`].sort(),
    )
    expect(notices.every((n) => n.payload.text === 'Vote in progress')).toBe(true)
  })

  it('closes itself when the countdown ends', async () => {
    const r = room()
    r.setSeats([seat('a', 'ops')])
    const v = await r.votes.open(def({ durationSec: 30 }))
    await vi.advanceTimersByTimeAsync(30_000)
    expect((await r.votes.list())[0]).toMatchObject({ voteId: v.voteId, status: 'closed' })
    expect(r.closed).toHaveLength(1)
  })
})

describe('ballots', () => {
  it('counts one ballot per device and lets a device change until close', async () => {
    const r = room()
    r.setSeats([seat('a', 'ops'), seat('b', 'ops'), seat('c', 'pio')])
    const v = await r.votes.open(def())
    await cast(r, v.voteId, 'a', 'o1', 1)
    await cast(r, v.voteId, 'b', 'o1', 1)
    await cast(r, v.voteId, 'c', 'o2', 1)
    await cast(r, v.voteId, 'a', 'o2', 2)
    const [now] = await r.votes.list()
    expect(now!.options.map((o) => o.count)).toEqual([1, 2, 0])
    expect(now).toMatchObject({ voted: 3, eligible: 3 })
  })

  it('ignores an older frame replayed after a newer one', async () => {
    const r = room()
    r.setSeats([seat('a', 'ops')])
    const v = await r.votes.open(def())
    await cast(r, v.voteId, 'a', 'o2', 5)
    expect(await cast(r, v.voteId, 'a', 'o1', 3)).toBe('ignored')
    expect((await r.votes.list())[0]!.options.map((o) => o.count)).toEqual([0, 1, 0])
  })

  it('keeps the first ballot when changing is off', async () => {
    const r = room()
    r.setSeats([seat('a', 'ops')])
    const v = await r.votes.open(def({ allowChange: false }))
    await cast(r, v.voteId, 'a', 'o1', 1)
    expect(await cast(r, v.voteId, 'a', 'o2', 2)).toBe('ignored')
    expect((await r.votes.list())[0]!.options.map((o) => o.count)).toEqual([1, 0, 0])
  })

  it('refuses ballots from out of scope, observers, unknown options and closed votes', async () => {
    const r = room()
    r.setSeats([
      seat('a', 'ops'),
      seat('b', 'pio'),
      { clientId: 'o', kind: 'observer', label: 'Observer', online: true },
    ])
    const v = await r.votes.open(def({ targets: ['role:ops'] }))
    expect(await cast(r, v.voteId, 'b', 'o1')).toBe('ignored')
    expect(await cast(r, v.voteId, 'o', 'o1')).toBe('ignored')
    expect(await cast(r, v.voteId, 'a', 'nope')).toBe('ignored')
    await r.votes.close(v.voteId)
    expect(await cast(r, v.voteId, 'a', 'o1')).toBe('ignored')
    const anomalies = r.logged.filter((e) => e.kind === 'anomaly').map((e) => e.data.what)
    expect(anomalies).toEqual([
      'vote out of scope',
      'vote out of scope',
      'vote bad option',
      'vote late',
    ])
    expect((await r.votes.list())[0]!.voted).toBe(0)
  })

  it('treats a team destination as in scope for its roles', async () => {
    const r = room()
    r.setSeats([seat('a', 'ops', { teamId: 'airport-ops' })])
    const v = await r.votes.open(def({ targets: ['team:airport-ops'] }))
    expect(await cast(r, v.voteId, 'a', 'o1')).toBe('recorded')
  })
})

describe('anonymity in the log', () => {
  it('writes ballots without a device, a seat or a role in an anonymous vote', async () => {
    const r = room()
    r.setSeats([seat('a', 'ops'), seat('b', 'pio')])
    const v = await r.votes.open(def({ rationalePrompt: 'Why?' }))
    await cast(r, v.voteId, 'a', 'o1', 1, 'Safer')
    await cast(r, v.voteId, 'b', 'o2', 1)
    await cast(r, v.voteId, 'b', 'o3', 2)
    const casts = r.logged.filter((e) => e.kind === 'vote.cast')
    expect(casts).toHaveLength(3)
    for (const e of casts) {
      expect(e.actor).toEqual({ kind: 'client' })
      expect(e.env).toBeUndefined()
      expect(Object.keys(e.data).sort()).not.toContain('role')
      expect(JSON.stringify(e)).not.toMatch(/"(a|b)"|ops|pio/)
    }
    expect(casts[2]!.data).toMatchObject({ optionId: 'o3', changedFrom: 'o2' })
    expect(r.logged.find((e) => e.kind === 'vote.rationale')!.data).toMatchObject({
      optionId: 'o1',
      text: 'Safer',
    })
  })

  it('ignores a rationale when the vote did not ask for one', async () => {
    const r = room()
    r.setSeats([seat('a', 'ops')])
    const v = await r.votes.open(def())
    await cast(r, v.voteId, 'a', 'o1', 1, 'unasked')
    expect(r.kinds()).not.toContain('vote.rationale')
  })

  it('carries a folded role in a by-role vote and folds small roles into other', async () => {
    const r = room()
    r.setSeats([
      seat('a', 'ops'),
      seat('b', 'ops'),
      seat('c', 'ops'),
      seat('d', 'pio'),
      seat('e', 'pio'),
    ])
    const v = await r.votes.open(def({ anonymous: false, k: 3 }))
    for (const id of ['a', 'b', 'c']) await cast(r, v.voteId, id, 'o1')
    await cast(r, v.voteId, 'd', 'o2')
    await cast(r, v.voteId, 'e', 'o2')
    const roles = r.logged.filter((e) => e.kind === 'vote.cast').map((e) => e.data.role)
    expect(roles).toEqual(['ops', 'ops', 'ops', 'other', 'other'])
    const closed = await r.votes.close(v.voteId)
    expect(closed.byRole).toEqual(
      expect.arrayContaining([
        { roleId: 'ops', label: 'Operations', optionId: 'o1', count: 3 },
        { roleId: 'other', label: 'Other', optionId: 'o2', count: 2 },
      ]),
    )
    const close = r.logged.find((e) => e.kind === 'vote.close')!
    expect(JSON.stringify(close.data)).not.toContain('pio')
    expect(r.sent.find((s) => s.type === 'vote.close')!.payload.byRole).toBeDefined()
  })
})

describe('closing, reopening and recording', () => {
  it('freezes the tally, tells every device, and reports the leaders to listeners', async () => {
    const r = room()
    r.setSeats([seat('a', 'ops'), seat('b', 'ops'), seat('c', 'ops')])
    const v = await r.votes.open(def())
    await cast(r, v.voteId, 'a', 'o1')
    await cast(r, v.voteId, 'b', 'o1')
    await cast(r, v.voteId, 'c', 'o2')
    const done = await r.votes.close(v.voteId)
    expect(done).toMatchObject({ status: 'closed', voted: 3, eligible: 3 })
    const msg = r.sent.find((s) => s.type === 'vote.close')!
    expect(msg.to).toBe('all')
    expect(msg.payload).toMatchObject({ status: 'closed', voted: 3, reveal: true })
    expect(r.closed[0]).toMatchObject({ voteId: v.voteId, leaders: ['o1'], voted: 3 })
    expect(r.logged.find((e) => e.kind === 'vote.close')!.data).toMatchObject({
      results: [
        { optionId: 'o1', count: 2 },
        { optionId: 'o2', count: 1 },
        { optionId: 'o3', count: 0 },
      ],
    })
  })

  it('reopens within two minutes with the ballots kept, and not after', async () => {
    const r = room()
    r.setSeats([seat('a', 'ops'), seat('b', 'ops')])
    const v = await r.votes.open(def())
    await cast(r, v.voteId, 'a', 'o1')
    await r.votes.close(v.voteId)
    r.advance(60_000)
    expect((await r.votes.list())[0]!.canReopen).toBe(true)
    const again = await r.votes.reopen(v.voteId)
    expect(again).toMatchObject({ status: 'open', voted: 1 })
    await cast(r, v.voteId, 'b', 'o2')
    await r.votes.close(v.voteId)
    r.advance(REOPEN_WINDOW_MS + 1)
    await vi.advanceTimersByTimeAsync(REOPEN_WINDOW_MS + 1)
    await expect(r.votes.reopen(v.voteId)).rejects.toThrow(/can no longer be reopened/)
    expect((await r.votes.list())[0]).toMatchObject({ voted: 2, canReopen: false })
    expect(r.kinds()).toContain('vote.reopen')
  })

  it('closes an open vote as interrupted when the session ends', async () => {
    const r = room()
    r.setSeats([seat('a', 'ops')])
    const v = await r.votes.open(def())
    await cast(r, v.voteId, 'a', 'o1')
    await r.votes.closeInterrupted()
    expect((await r.votes.list())[0]).toMatchObject({ status: 'interrupted', voted: 1 })
    expect(r.sent.find((s) => s.type === 'vote.close')!.payload.status).toBe('interrupted')
  })

  it('records a closed vote as a decision once', async () => {
    const r = room()
    r.setSeats([seat('a', 'ops')])
    const v = await r.votes.open(def(), { rowId: 'I-14' })
    await expect(r.votes.markRecorded(v.voteId, '2:14')).rejects.toThrow(/Close the vote/)
    await cast(r, v.voteId, 'a', 'o1')
    await r.votes.close(v.voteId)
    const out = await r.votes.markRecorded(v.voteId, '2:14')
    expect(out).toEqual({ text: 'Yes (1 of 1), vote at 2:14', rowId: 'I-14' })
    await expect(r.votes.markRecorded(v.voteId, '2:14')).rejects.toThrow(/already recorded/)
    expect(r.logged.find((e) => e.kind === 'vote.recorded')!.ref).toMatchObject({ rowId: 'I-14' })
  })
})

describe('live results', () => {
  it('re-sends vote.open with the tally at most every batch interval', async () => {
    const r = room()
    r.setSeats([seat('a', 'ops'), seat('b', 'ops'), seat('c', 'ops')])
    const v = await r.votes.open(def({ liveResults: true }))
    const opens = () => r.sent.filter((s) => s.type === 'vote.open').length
    await cast(r, v.voteId, 'a', 'o1')
    await cast(r, v.voteId, 'b', 'o1')
    await cast(r, v.voteId, 'c', 'o2')
    expect(opens()).toBe(1)
    await vi.advanceTimersByTimeAsync(TALLY_BATCH_MS)
    expect(opens()).toBe(2)
    expect(r.sent.at(-1)!.payload.tally).toEqual([
      { optionId: 'o1', count: 2 },
      { optionId: 'o2', count: 1 },
      { optionId: 'o3', count: 0 },
    ])
  })

  it('sends no tally to devices when live results are off', async () => {
    const r = room()
    r.setSeats([seat('a', 'ops')])
    const v = await r.votes.open(def())
    await cast(r, v.voteId, 'a', 'o1')
    await vi.advanceTimersByTimeAsync(TALLY_BATCH_MS * 2)
    expect(r.sent.filter((s) => s.type === 'vote.open')).toHaveLength(1)
  })
})

describe('scope warning', () => {
  it('lists roles in scope with fewer devices than k', () => {
    const r = room()
    r.setSeats([
      seat('a', 'ops'),
      seat('b', 'ops'),
      seat('c', 'ops'),
      seat('d', 'pio'),
      seat('e', 'pio'),
    ])
    expect(r.votes.scope(['all'], 3)).toEqual({
      eligible: 5,
      small: [{ roleId: 'pio', devices: 2 }],
    })
  })
})
