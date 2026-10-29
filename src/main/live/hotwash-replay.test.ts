// A past hot wash board is the live board, rebuilt from the session log (#415 FR-11).
import { describe, expect, it } from 'vitest'
import type { HotwashItemPayload } from '@shared/live/schemas'
import type { SessionLogEntry, SessionLogInput } from '@shared/schemas/live'
import { HotWash, type HotWashSeat } from './hotwash'
import { boardFromLog } from './hotwash-replay'

const id = (n: number) => String(n).padStart(22, 'A')
const AT = 1_000_000

const SEATS: Record<string, HotWashSeat> = {
  ops: { clientId: 'ops', kind: 'player', roleId: 'ops', label: 'Ops Director' },
  pio: { clientId: 'pio', kind: 'player', roleId: 'pio', label: 'PIO', displayName: 'Pat' },
  it: { clientId: 'it', kind: 'player', roleId: 'it', label: 'IT Director' },
}
const roleNames: Record<string, string> = { ops: 'Ops Director', pio: 'PIO', it: 'IT Director' }
const questions = [{ id: 'hwq-1', topic: 'Coordination', text: 'What slowed Ops and IT?' }]

function setup() {
  const logs: SessionLogInput[] = []
  let next = 100
  const hw = new HotWash({
    send: async () => undefined,
    log: { append: async (input) => void logs.push(input) },
    seatOf: (c) => SEATS[c],
    clientRef: async (c) => `ref-${c}`.padEnd(8, '0').slice(0, 8),
    questions,
    clock: async () => ({ time: '1:20' }),
    now: () => AT,
    newId: () => id(next++),
    changed: () => undefined,
  })
  const post = (from: string, n: number, p: Partial<HotwashItemPayload> = {}) =>
    hw.onItem(from, n, {
      itemId: id(n),
      kind: 'improvement',
      text: `item ${n}`,
      anonymous: false,
      ...p,
    } as HotwashItemPayload)
  const entries = (): SessionLogEntry[] =>
    logs.map((l, i) => ({ ...l, i: i + 1, at: new Date(AT).toISOString() }))
  return { hw, post, entries }
}

const replay = (entries: SessionLogEntry[]) =>
  boardFromLog(entries, questions, (rid) => (rid ? roleNames[rid] : undefined))

/** The live board with the values the log cannot hold (it is closed once a session is past). */
const pastOf = (live: ReturnType<HotWash['board']>) => ({ ...live, open: false })

describe('boardFromLog', () => {
  it('rebuilds a moderated board: review, accept, edit, group, hide, plus-ones and promotion', async () => {
    const { hw, post, entries } = setup()
    await hw.openOnDevices(true)
    await post('ops', 1, { kind: 'strength', anonymous: false })
    await post('pio', 2)
    await post('it', 3, { anonymous: true })
    await post('ops', 4, { questionId: 'hwq-1' })
    await hw.acceptItems([id(1), id(2), id(3)])
    await post('pio', 5)
    await hw.editItem(id(2), 'item two, clearer')
    await hw.tagItems([id(1)], { objectiveId: 'obj-1' })
    await hw.groupItems([id(1), id(2)], 'Shared picture')
    await hw.hideItems([id(3)])
    await hw.onItem('it', 9, { itemId: id(9), plusOneOf: id(1) } as HotwashItemPayload)
    await hw.promote(id(1))
    await hw.closeOnDevices()
    expect(replay(entries())).toEqual(pastOf(hw.board()))
  })

  it('rebuilds an unmoderated board, an ungroup and an unpromote', async () => {
    const { hw, post, entries } = setup()
    await hw.openOnDevices(false)
    await post('ops', 1)
    await post('pio', 2)
    await post('it', 3)
    await hw.groupItems([id(1), id(2), id(3)])
    await hw.ungroupItems([id(3)])
    await hw.promote(id(1))
    await hw.unpromote(id(1))
    expect(replay(entries())).toEqual(pastOf(hw.board()))
  })

  it('follows a change of moderation made while open', async () => {
    const { hw, post, entries } = setup()
    await hw.openOnDevices(false)
    await post('ops', 1)
    hw.setReview(true)
    await post('pio', 2)
    const board = replay(entries())
    expect(board.review).toBe(true)
    expect(board.items.map((i) => i.accepted)).toEqual([true, false])
  })

  it('is empty for a session that never held a hot wash', () => {
    expect(replay([])).toEqual({
      open: false,
      review: false,
      items: [],
      groups: [],
      questions,
    })
  })
})
