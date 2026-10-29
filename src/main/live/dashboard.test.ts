import { describe, expect, it } from 'vitest'
import type { SessionLogEntry } from '@shared/schemas/live'
import { dashboardView, median } from './dashboard'

const T0 = Date.parse('2026-10-28T13:00:00.000Z')
const at = (min: number, sec = 0) => new Date(T0 + min * 60_000 + sec * 1000).toISOString()
const roles = [
  { id: 'ops', name: 'Ops Director', team: 'airport' },
  { id: 'pio', name: 'PIO', team: 'airport' },
  { id: 'asc', name: 'ASC', team: 'security' },
]

let n = 0
const entry = (min: number, over: Partial<SessionLogEntry> & { kind: string }, sec = 0) =>
  ({ i: ++n, at: at(min, sec), actor: { kind: 'system' }, data: {}, ...over }) as SessionLogEntry

const join = (min: number, ref: string, roleId: string, name?: string) =>
  entry(min, {
    kind: 'client.join',
    actor: {
      kind: 'client',
      clientRef: ref,
      seat: { kind: 'player', roleId },
      ...(name ? { displayName: name } : {}),
    },
  })
const release = (min: number, rowId: string, targets: string[], expectsResponse = true) =>
  entry(min, {
    kind: 'inject.release',
    actor: { kind: 'controller' },
    ref: { rowId, releaseId: `rel-${rowId}` },
    data: { targets, expectsResponse },
  })
const receipt = (
  min: number,
  ref: string,
  roleId: string,
  rowId: string,
  status: string,
  sec = 0,
) =>
  entry(
    min,
    {
      kind: 'inject.receipt',
      actor: { kind: 'client', clientRef: ref, seat: { kind: 'player', roleId } },
      ref: { rowId, releaseId: `rel-${rowId}` },
      data: { status },
    },
    sec,
  )
const message = (
  min: number,
  from: 'client' | 'controller',
  channel: string,
  roleId?: string,
  ref = 'aaaa0001',
) =>
  entry(min, {
    kind: 'message',
    actor:
      from === 'client'
        ? { kind: 'client', clientRef: ref, seat: { kind: 'player', roleId } }
        : { kind: 'controller', persona: 'Reporter' },
    ref: { messageId: `m${n}`, channel },
    data: { text: 'hello' },
  })

const view = (entries: SessionLogEntry[], nowMin: number, over = {}) =>
  dashboardView(entries, { roles, now: T0 + nowMin * 60_000, live: true, ...over })

describe('roster', () => {
  it('counts connected, left and removed devices per seat and flags empty player seats', () => {
    const entries = [
      join(1, 'aaaa0001', 'ops'),
      join(1, 'aaaa0002', 'ops'),
      join(2, 'aaaa0003', 'pio'),
      entry(3, {
        kind: 'client.leave',
        actor: { kind: 'client', clientRef: 'aaaa0002', seat: { kind: 'player', roleId: 'ops' } },
      }),
      entry(4, {
        kind: 'client.kick',
        actor: { kind: 'client', clientRef: 'aaaa0003', seat: { kind: 'player', roleId: 'pio' } },
      }),
    ]
    const { roster, connected } = view(entries, 5)
    const by = Object.fromEntries(roster.map((r) => [r.seat, r]))
    expect(by.ops).toMatchObject({ connected: 1, removed: 0, empty: false })
    expect(by.pio).toMatchObject({ connected: 0, removed: 1, empty: true })
    expect(by.asc).toMatchObject({ connected: 0, empty: true })
    expect(connected).toBe(1)
  })

  it('lists display names only when the log carries them', () => {
    const { roster } = view([join(1, 'aaaa0001', 'ops', 'Dana')], 2)
    expect(roster.find((r) => r.seat === 'ops')!.names).toEqual(['Dana'])
  })
})

describe('injects and unanswered', () => {
  const base = () => [join(0, 'aaaa0001', 'ops'), join(0, 'aaaa0002', 'pio')]

  it('counts delivered, read and actioned and the median time to first read', () => {
    const entries = [
      ...base(),
      release(1, 'I-06', ['role:ops', 'role:pio']),
      receipt(1, 'aaaa0001', 'ops', 'I-06', 'delivered'),
      receipt(2, 'aaaa0001', 'ops', 'I-06', 'read'),
      receipt(3, 'aaaa0002', 'pio', 'I-06', 'read'),
    ]
    const [row] = view(entries, 4).injects
    expect(row).toMatchObject({ expected: 2, delivered: 2, read: 2, actioned: 0, firstReadSec: 90 })
  })

  it('flags a release that expects a response once the window has passed', () => {
    const entries = [...base(), release(1, 'I-07', ['role:ops'])]
    expect(view(entries, 10).unanswered).toEqual([])
    const late = view(entries, 11).unanswered
    expect(late).toEqual([{ releaseId: 'rel-I-07', rowId: 'I-07', ageMin: 10, windowMin: 10 }])
  })

  it('uses the session window when given and ignores rows that expect no response', () => {
    const entries = [
      ...base(),
      release(1, 'I-07', ['role:ops']),
      release(1, 'I-08', ['role:ops'], false),
    ]
    expect(view(entries, 3, { unansweredAfterMin: 1 }).unanswered.map((u) => u.rowId)).toEqual([
      'I-07',
    ])
  })

  it('treats an actioned receipt from a targeted seat as an answer', () => {
    const entries = [
      ...base(),
      release(1, 'I-07', ['role:ops']),
      receipt(5, 'aaaa0001', 'ops', 'I-07', 'actioned'),
    ]
    const v = view(entries, 30)
    expect(v.unanswered).toEqual([])
    expect(v.injects[0]).toMatchObject({ answered: 'actioned', responseSec: 240 })
  })

  it('does not count an actioned receipt from a seat that was not targeted', () => {
    const entries = [
      ...base(),
      release(1, 'I-07', ['role:ops']),
      receipt(5, 'aaaa0002', 'pio', 'I-07', 'actioned'),
    ]
    expect(view(entries, 30).unanswered).toHaveLength(1)
  })

  it('treats a later message from a targeted seat as an answer, but not an earlier one', () => {
    const early = [
      ...base(),
      message(0, 'client', 'controller', 'ops'),
      release(1, 'I-07', ['role:ops']),
    ]
    expect(view(early, 30).unanswered).toHaveLength(1)
    const later = [
      ...base(),
      release(1, 'I-07', ['role:ops']),
      message(6, 'client', 'controller', 'ops'),
    ]
    expect(view(later, 30).injects[0]).toMatchObject({ answered: 'message', responseSec: 300 })
  })

  it('clears a release when the facilitator marks it answered', () => {
    const entries = [
      ...base(),
      release(1, 'I-07', ['role:ops']),
      entry(12, {
        kind: 'inject.answered',
        actor: { kind: 'controller' },
        ref: { rowId: 'I-07', releaseId: 'rel-I-07' },
      }),
    ]
    const v = view(entries, 30)
    expect(v.unanswered).toEqual([])
    expect(v.injects[0]!.answered).toBe('marked')
  })

  it('matches a team target to the roles on that team', () => {
    const entries = [
      ...base(),
      release(1, 'I-09', ['team:airport']),
      message(2, 'client', 'controller', 'pio', 'aaaa0002'),
    ]
    expect(view(entries, 30).injects[0]!.answered).toBe('message')
  })

  it('does not flag a withdrawn release and sorts the oldest first', () => {
    const entries = [
      ...base(),
      release(1, 'I-07', ['role:ops']),
      release(2, 'I-08', ['role:ops']),
      release(3, 'I-09', ['role:ops']),
      entry(4, {
        kind: 'inject.retract',
        actor: { kind: 'controller' },
        ref: { rowId: 'I-09', releaseId: 'rel-I-09' },
      }),
    ]
    expect(view(entries, 40).unanswered.map((u) => u.rowId)).toEqual(['I-07', 'I-08'])
  })
})

describe('messages, votes, hot wash, health', () => {
  it('reports waiting threads and the median reply time', () => {
    const entries = [
      join(0, 'aaaa0001', 'pio'),
      message(1, 'client', 'role:pio', 'pio'),
      message(3, 'controller', 'role:pio'),
      message(5, 'client', 'role:pio', 'pio'),
      message(6, 'client', 'role:ops', 'ops', 'aaaa0002'),
    ]
    const m = view(entries, 10).messages
    expect(m.threads).toBe(2)
    expect(m.medianReplySec).toBe(120)
    expect(m.waiting).toEqual([
      { channel: 'role:pio', waitingMin: 5 },
      { channel: 'role:ops', waitingMin: 4 },
    ])
    expect(m.perRole).toEqual([
      { role: 'PIO', count: 2 },
      { role: 'Ops Director', count: 1 },
    ])
  })

  it('tallies an open vote and keeps the last closed result', () => {
    const open = (id: string) =>
      entry(1, {
        kind: 'vote.open',
        actor: { kind: 'controller' },
        ref: { voteId: id },
        data: {
          question: 'Close the terminal?',
          options: [
            { id: 'y', label: 'Yes' },
            { id: 'n', label: 'No' },
          ],
        },
      })
    const cast = (id: string, optionId: string) =>
      entry(2, {
        kind: 'vote.cast',
        actor: { kind: 'system' },
        ref: { voteId: id },
        data: { optionId },
      })
    const close = entry(3, {
      kind: 'vote.close',
      actor: { kind: 'controller' },
      ref: { voteId: 'v1' },
      data: {
        results: [
          { optionId: 'y', count: 9 },
          { optionId: 'n', count: 4 },
        ],
      },
    })
    const v = view(
      [open('v1'), cast('v1', 'y'), close, open('v2'), cast('v2', 'n'), cast('v2', 'n')],
      5,
    ).votes
    expect(v.lastClosed!.tally).toEqual([
      { label: 'Yes', count: 9 },
      { label: 'No', count: 4 },
    ])
    expect(v.open).toMatchObject({
      voteId: 'v2',
      tally: [
        { label: 'Yes', count: 0 },
        { label: 'No', count: 2 },
      ],
    })
  })

  it('counts hot wash items, plus ones and promoted items from the log', () => {
    const item = (id: string, data = {}) =>
      entry(1, { kind: 'hotwash.item', actor: { kind: 'system' }, ref: { itemId: id }, data })
    const entries = [
      entry(0, { kind: 'hotwash.open', actor: { kind: 'controller' } }),
      item('a'),
      item('b'),
      entry(2, { kind: 'hotwash.plus', actor: { kind: 'system' }, ref: { itemId: 'a' } }),
      entry(3, { kind: 'hotwash.promoted', actor: { kind: 'controller' }, ref: { itemId: 'a' } }),
    ]
    expect(view(entries, 5).hotwash).toEqual({ open: true, items: 2, plusOnes: 1, promoted: 1 })
  })

  it('separates dropped frames by reason from other anomalies', () => {
    const anomaly = (data: Record<string, unknown>) => entry(1, { kind: 'anomaly', data })
    const h = view(
      [
        entry(0, { kind: 'session.start', data: { protocol: 1 } }),
        anomaly({ what: 'frame dropped', reason: 'REPLAY' }),
        anomaly({ what: 'frame dropped', reason: 'REPLAY' }),
        anomaly({ what: 'receipt rejected' }),
      ],
      2,
      { logBytes: 900 },
    ).health
    expect(h).toMatchObject({
      dropped: [{ reason: 'REPLAY', count: 2 }],
      rejected: 1,
      protocolVersion: 1,
      logBytes: 900,
    })
    expect(h.lastIndex).toBeGreaterThan(0)
  })
})

describe('median', () => {
  it('handles empty, odd and even lists', () => {
    expect(median([])).toBeUndefined()
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
  })
})
