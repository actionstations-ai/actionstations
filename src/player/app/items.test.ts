import { describe, expect, it } from 'vitest'
import type { Opened } from '../../shared/live/codec'
import { IDS, PAYLOAD_FIXTURES } from '../../shared/live/fixtures/payloads'
import type { MessageType } from '../../shared/live/protocol'
import {
  compareItems,
  insertItem,
  isFeedItem,
  isInboxItem,
  itemFromMessage,
  seatDestinations,
  type Item,
  type SeatView,
} from './items'

function opened<T extends MessageType>(
  type: T,
  to: string,
  payload: Opened<T>['payload'],
  over: Partial<Opened<T>> = {},
): Opened<T> {
  return {
    type,
    from: IDS.controller,
    to,
    seq: 1,
    ts: 1_700_000_000_000,
    payload,
    signedBy: 'host',
    ...over,
  } as Opened<T>
}

const clockAt = () => 75 // 1:15 at arrival
const ops: SeatView = {
  clientId: IDS.playerA,
  roleId: 'ops-director',
  teamId: 'ops',
  kind: 'player',
}

describe('itemFromMessage', () => {
  it('turns an inject release into a text card ordered by its exercise time', () => {
    const item = itemFromMessage(
      opened('inject.release', 'role:ops-director', PAYLOAD_FIXTURES['inject.release']),
      clockAt,
    )!
    expect(item.kind).toBe('inject')
    expect(item.key).toBe(`inject:${IDS.release}:role:ops-director`)
    expect(item.inject).toMatchObject({ releaseId: IDS.release, expectsResponse: true })
    expect(item.title).toBe('FIDS boards go dark')
    expect(item.body).toContain('All departure boards')
    expect(item.altText).toBe('A dark FIDS board')
    expect(item.sender).toBe('Terminal operations')
    expect(item.exerciseTime).toBe(PAYLOAD_FIXTURES['inject.release'].exerciseTime)
    expect(item.ref).toBe(IDS.release)
  })

  it('shows a notice with its level and dismissibility', () => {
    const item = itemFromMessage(
      opened('controller.notice', 'all', {
        ...PAYLOAD_FIXTURES['controller.notice'],
        level: 'urgent',
        text: 'Evacuate the EOC',
        dismissible: false,
        kind: 'text',
      } as Opened<'controller.notice'>['payload']),
      clockAt,
    )!
    expect(item.kind).toBe('notice')
    expect(item.level).toBe('urgent')
    expect(item.title).toBe('Urgent')
    expect(item.body).toBe('Evacuate the EOC')
    expect(item.dismissible).toBe(false)
    expect(item.exerciseTime).toBe('1:15')
  })

  it('maps reseat and hot wash notice kinds to their own item kinds', () => {
    const base = PAYLOAD_FIXTURES['controller.notice']
    const reseat = itemFromMessage(
      opened('controller.notice', `client:${IDS.playerA}`, { ...base, kind: 'reseat' } as never),
      clockAt,
    )!
    expect(reseat.kind).toBe('reseat')
    const hot = itemFromMessage(
      opened('controller.notice', 'all', { ...base, kind: 'hotwash.open' } as never),
      clockAt,
    )!
    expect(hot.kind).toBe('announcement')
    expect(hot.tab).toBe('hotwash')
  })

  it('lists clock changes that carry a reason and skips silent syncs', () => {
    const jump = itemFromMessage(
      opened('clock.state', 'all', { elapsedMin: 120, rate: 1, reason: 'jump' }),
      clockAt,
    )!
    expect(jump.kind).toBe('clock')
    expect(jump.title).toBe('Time jump to 2:00')
    expect(
      itemFromMessage(opened('clock.state', 'all', { elapsedMin: 120, rate: 1 }), clockAt),
    ).toBeUndefined()
  })

  it('announces votes and surveys with the tab they belong to', () => {
    const vote = itemFromMessage(
      opened('vote.open', 'all', PAYLOAD_FIXTURES['vote.open'] as never),
      clockAt,
    )!
    expect(vote.kind).toBe('announcement')
    expect(vote.tab).toBe('votes')
    expect(vote.body).toBe(PAYLOAD_FIXTURES['vote.open'].question)
    const survey = itemFromMessage(
      opened('survey.close', 'all', PAYLOAD_FIXTURES['survey.close']),
      clockAt,
    )!
    expect(survey.tab).toBe('surveys')
  })

  it('returns nothing for frames other specs own or the session handles', () => {
    for (const type of ['message.send', 'welcome', 'session.end', 'eval.assign'] as const) {
      expect(
        itemFromMessage(opened(type, 'all', PAYLOAD_FIXTURES[type] as never), clockAt),
      ).toBeUndefined()
    }
  })
})

describe('inbox and feed routing', () => {
  const inject = (to: string, seq = 1) =>
    itemFromMessage(
      opened('inject.release', to, PAYLOAD_FIXTURES['inject.release'], { seq }),
      clockAt,
    )!
  const notice = (to: string, seq = 1) =>
    itemFromMessage(
      opened('controller.notice', to, PAYLOAD_FIXTURES['controller.notice'] as never, { seq }),
      clockAt,
    )!

  it('a seat reads its role, team, device and reserved destinations', () => {
    expect([...seatDestinations(ops)].sort()).toEqual(
      [`client:${IDS.playerA}`, 'role:ops-director', 'team:ops'].sort(),
    )
    expect(seatDestinations({ clientId: IDS.evaluator, kind: 'evaluator' })).toContain(
      'role:evaluators',
    )
  })

  it('injects to my role, team or device are inbox; injects to all or others are not', () => {
    expect(isInboxItem(inject('role:ops-director'), ops)).toBe(true)
    expect(isInboxItem(inject('team:ops'), ops)).toBe(true)
    expect(isInboxItem(inject(`client:${IDS.playerA}`), ops)).toBe(true)
    expect(isInboxItem(inject('all'), ops)).toBe(false)
    expect(isInboxItem(inject('role:pio'), ops)).toBe(false)
    expect(isInboxItem(inject('role:ops-director'), undefined)).toBe(false)
  })

  it('the feed holds items to all plus notices for me, never injects to my seat', () => {
    expect(isFeedItem(inject('all'), ops)).toBe(true)
    expect(isFeedItem(notice('all'), ops)).toBe(true)
    expect(isFeedItem(notice('role:ops-director'), ops)).toBe(true)
    expect(isFeedItem(notice('role:pio'), ops)).toBe(false)
    expect(isFeedItem(inject('role:ops-director'), ops)).toBe(false)
  })

  it('after a reseat the same items route to the new seat without any new frame', () => {
    const items = [inject('role:ops-director', 1), inject('role:pio', 2)]
    const pio: SeatView = { ...ops, roleId: 'pio' }
    expect(items.filter((i) => isInboxItem(i, ops)).map((i) => i.seq)).toEqual([1])
    expect(items.filter((i) => isInboxItem(i, pio)).map((i) => i.seq)).toEqual([2])
  })
})

describe('insertItem', () => {
  const at = (atMin: number, seq: number, ts = seq): Item => ({
    key: `c:${seq}`,
    kind: 'notice',
    type: 'controller.notice',
    from: 'c',
    to: 'all',
    seq,
    ts,
    atMin,
    exerciseTime: '0:00',
    title: `n${seq}`,
  })

  it('keeps newest exercise time on top, arrival breaking ties', () => {
    let list: Item[] = []
    list = insertItem(list, at(10, 1))
    list = insertItem(list, at(30, 2))
    list = insertItem(list, at(20, 3))
    list = insertItem(list, at(20, 4))
    expect(list.map((i) => i.seq)).toEqual([2, 4, 3, 1])
    expect([at(5, 9), at(5, 8)].sort(compareItems).map((i) => i.seq)).toEqual([9, 8])
  })

  it('a frame seen twice (live and from catch-up) is one item', () => {
    const list = insertItem([at(10, 1)], at(10, 1))
    expect(list).toHaveLength(1)
  })

  it('returns the same array when nothing changed, so React skips the render', () => {
    const list = insertItem([], at(10, 1))
    expect(insertItem(list, at(10, 1))).toBe(list)
  })
})
