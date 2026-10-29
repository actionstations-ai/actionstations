import { describe, expect, it } from 'vitest'
import type { SessionLogEntry } from '@shared/schemas/live'
import { trackerFeed } from './tracker-feed'

const T0 = Date.parse('2026-10-29T13:00:00.000Z')
const at = (min: number) => new Date(T0 + min * 60_000).toISOString()
const roles = [
  { id: 'ops', name: 'Ops Director' },
  { id: 'pio', name: 'PIO' },
]

let n = 0
const entry = (min: number, over: Partial<SessionLogEntry> & { kind: string }) =>
  ({ i: ++n, at: at(min), actor: { kind: 'system' }, data: {}, ...over }) as SessionLogEntry

const join = (ref: string, roleId: string) =>
  entry(0, {
    kind: 'client.join',
    actor: { kind: 'client', clientRef: ref, seat: { kind: 'player', roleId } },
  })
const release = (min: number, rowId: string, targets: string[]) =>
  entry(min, {
    kind: 'inject.release',
    actor: { kind: 'controller' },
    ref: { rowId, releaseId: `rel-${rowId}` },
    data: { targets },
  })
const message = (min: number, ref: string, roleId: string, text: string, id = `m${min}`) =>
  entry(min, {
    kind: 'message',
    actor: { kind: 'client', clientRef: ref, seat: { kind: 'player', roleId } },
    ref: { messageId: id, channel: 'c1' },
    data: { text },
  })

describe('trackerFeed', () => {
  it('turns releases and receipts into the entries the T2 rule reads', () => {
    const feed = trackerFeed(
      [
        join('aaaa1111', 'ops'),
        release(1, 'I-01', ['role:ops']),
        entry(2, {
          kind: 'inject.receipt',
          actor: { kind: 'client', clientRef: 'aaaa1111', seat: { kind: 'player', roleId: 'ops' } },
          ref: { rowId: 'I-01', releaseId: 'rel-I-01' },
          data: { status: 'read' },
        }),
      ],
      roles,
    )
    expect(feed.live).toBe(true)
    expect(feed.session).toEqual([
      { kind: 'inject.release', at: T0 + 60_000, rowId: 'I-01' },
      { kind: 'inject.receipt', at: T0 + 120_000, rowId: 'I-01', receipt: 'read' },
    ])
  })

  it('counts a device message as an answer to the rows sent to its seat before it', () => {
    const feed = trackerFeed(
      [
        join('aaaa1111', 'ops'),
        join('bbbb2222', 'pio'),
        release(1, 'I-01', ['role:ops']),
        release(2, 'I-02', ['role:pio']),
        message(3, 'aaaa1111', 'ops', 'We are calling the airlines now.'),
      ],
      roles,
    )
    const answers = feed.session.filter((e) => e.kind === 'message.send')
    expect(answers).toEqual([
      { kind: 'message.send', at: T0 + 180_000, rowId: 'I-01', fromPlayer: true },
    ])
  })

  it('ignores a message sent before the release and one from the controller', () => {
    const feed = trackerFeed(
      [
        join('aaaa1111', 'ops'),
        message(0, 'aaaa1111', 'ops', 'early'),
        release(1, 'I-01', ['role:ops']),
        entry(2, {
          kind: 'message',
          actor: { kind: 'controller' },
          ref: { messageId: 'c2', channel: 'c1' },
          data: { text: 'from the SimCell' },
        }),
      ],
      roles,
    )
    expect(feed.session.filter((e) => e.kind === 'message.send')).toEqual([])
    expect(feed.messages.map((m) => m.text)).toEqual(['early', 'from the SimCell'])
  })

  it('maps a closed vote to the row it was opened on', () => {
    const feed = trackerFeed(
      [
        entry(1, {
          kind: 'vote.open',
          actor: { kind: 'controller' },
          ref: { voteId: 'v1', rowId: 'I-05' },
          data: { mselRowId: 'I-05' },
        }),
        entry(4, { kind: 'vote.close', actor: { kind: 'controller' }, ref: { voteId: 'v1' } }),
        entry(5, { kind: 'vote.close', actor: { kind: 'controller' }, ref: { voteId: 'other' } }),
      ],
      roles,
    )
    expect(feed.session).toEqual([{ kind: 'vote.close', at: T0 + 240_000, rowId: 'I-05' }])
  })

  it('offers message text with the row it answers, capped to the latest 200', () => {
    const entries = [
      join('aaaa1111', 'ops'),
      release(1, 'I-01', ['role:ops']),
      ...Array.from({ length: 250 }, (_, i) =>
        message(2, 'aaaa1111', 'ops', `note ${i}`, `m-${i}`),
      ),
    ]
    const feed = trackerFeed(entries, roles)
    expect(feed.messages).toHaveLength(200)
    expect(feed.messages.at(-1)).toMatchObject({ text: 'note 249', rowId: 'I-01' })
  })
})
