import { beforeEach, describe, expect, it } from 'vitest'
import type { HotwashItemPayload } from '@shared/live/schemas'
import type { SessionLogInput } from '@shared/schemas/live'
import {
  HotWash,
  RETRACT_WINDOW_MS,
  hotwashPrompts,
  type HotWashDeps,
  type HotWashSeat,
} from './hotwash'

const id = (n: number) => String(n).padStart(22, 'A')

const SEATS: Record<string, HotWashSeat> = {
  ops: { clientId: 'ops', kind: 'player', roleId: 'ops', label: 'Ops Director' },
  pio: { clientId: 'pio', kind: 'player', roleId: 'pio', label: 'PIO', displayName: 'Pat' },
  ev: { clientId: 'ev', kind: 'evaluator', roleId: 'evaluators', label: 'Evaluator' },
  obs: { clientId: 'obs', kind: 'observer', roleId: 'observers', label: 'Observer' },
}

interface Sent {
  type: string
  to: string
  payload: Record<string, unknown>
}

function setup(over: Partial<HotWashDeps> = {}) {
  const sent: Sent[] = []
  const logs: SessionLogInput[] = []
  let now = 1_000_000
  const clock = { advance: (ms: number) => (now += ms) }
  let nextId = 100
  const deps: HotWashDeps = {
    send: async (type, to, payload) => void sent.push({ type, to, payload }),
    log: { append: async (input) => void logs.push(input) },
    seatOf: (c) => SEATS[c],
    clientRef: async (c) => `ref-${c}`.padEnd(8, '0').slice(0, 8),
    questions: [{ id: 'hwq-1', topic: 'Coordination', text: 'What slowed Ops and IT?' }],
    clock: async () => ({ time: '1:20' }),
    now: () => now,
    newId: () => id(nextId++),
    changed: () => undefined,
    ...over,
  }
  const hw = new HotWash(deps)
  const post = (from: string, n: number, p: Partial<HotwashItemPayload> = {}) =>
    hw.onItem(from, n, {
      itemId: id(n),
      kind: 'improvement',
      text: `item ${n}`,
      anonymous: false,
      ...p,
    } as HotwashItemPayload)
  return { hw, sent, logs, clock, post }
}

const updates = (sent: Sent[], action: string) =>
  sent.filter((s) => s.type === 'hotwash.update' && s.payload.action === action)

describe('opening and closing', () => {
  it('tells every device and logs it once', async () => {
    const { hw, sent, logs } = setup()
    await hw.openOnDevices(false)
    await hw.openOnDevices(false)
    expect(sent.filter((s) => s.payload.kind === 'hotwash.open')).toHaveLength(1)
    expect(sent[0]).toMatchObject({ type: 'controller.notice', to: 'all' })
    await hw.closeOnDevices()
    expect(logs.map((l) => l.kind)).toEqual(['hotwash.open', 'hotwash.close'])
    expect(hw.board().open).toBe(false)
  })

  it('drops an item posted while closed and counts it as an anomaly', async () => {
    const { hw, logs, post } = setup()
    await post('ops', 1)
    expect(hw.board().items).toHaveLength(0)
    expect(logs[0]).toMatchObject({ kind: 'anomaly' })
  })

  it('builds the prompts from the scenario, at most ten questions', () => {
    const questions = Array.from({ length: 12 }, (_, i) => ({ topic: '', text: `Q${i}` }))
    const prompts = hotwashPrompts({ method: '3up3down', methodDescription: '', questions })
    expect(prompts.questions).toHaveLength(10)
    expect(prompts.questions[0]).toEqual({ id: 'hwq-1', text: 'Q0' })
  })
})

describe('attribution', () => {
  let t: ReturnType<typeof setup>
  beforeEach(async () => {
    t = setup()
    await t.hw.openOnDevices(false)
  })

  it('shows the role unless the player posts without it', async () => {
    await t.post('ops', 1)
    await t.post('pio', 2, { anonymous: true })
    const [a, b] = t.hw.board().items
    expect(a).toMatchObject({ anonymous: false, roleLabel: 'Ops Director' })
    expect(b!.roleLabel).toBeUndefined()
    const shown = updates(t.sent, 'accept')
    expect(shown[0]!.payload).toMatchObject({ roleId: 'ops' })
    expect(shown[1]!.payload).not.toHaveProperty('roleId')
  })

  it('keeps the seat and name of an anonymous item out of the log', async () => {
    await t.post('pio', 2, { anonymous: true })
    const entry = t.logs.find((l) => l.kind === 'hotwash.item')!
    expect(entry.actor).toEqual({ kind: 'client', clientRef: 'ref-pio0' })
    expect(JSON.stringify(entry)).not.toMatch(/PIO|Pat|"seat"/)
  })

  it('logs the seat of a role-attributed item', async () => {
    await t.post('ops', 1)
    const entry = t.logs.find((l) => l.kind === 'hotwash.item')!
    expect(entry.actor.seat).toEqual({ kind: 'player', roleId: 'ops' })
  })

  it('carries the display name of a named session only when not anonymous', async () => {
    await t.post('pio', 3)
    await t.post('pio', 4, { anonymous: true })
    const [named, anon] = t.hw.board().items
    expect(named!.displayName).toBe('Pat')
    expect(anon!.displayName).toBeUndefined()
  })

  it('lets evaluators post and refuses observers', async () => {
    await t.post('ev', 5)
    await t.post('obs', 6)
    expect(t.hw.board().items.map((i) => i.roleLabel)).toEqual(['Evaluator'])
    expect(t.logs.some((l) => l.kind === 'anomaly')).toBe(true)
  })

  it('never puts a device reference on the board', async () => {
    await t.post('ops', 1)
    expect(JSON.stringify(t.hw.board())).not.toContain('ref-ops')
  })

  it('keeps a known question id and drops an unknown one', async () => {
    await t.post('ops', 1, { questionId: 'hwq-1' })
    await t.post('ops', 2, { questionId: 'hwq-9' })
    expect(t.hw.board().items.map((i) => i.questionId)).toEqual(['hwq-1', undefined])
  })
})

describe('moderation', () => {
  it('shows items at once by default', async () => {
    const { hw, sent, post } = setup()
    await hw.openOnDevices(false)
    await post('ops', 1)
    expect(hw.board().items[0]).toMatchObject({ accepted: true })
    expect(updates(sent, 'accept')[0]!.payload).toMatchObject({
      text: 'item 1',
      kind: 'improvement',
    })
  })

  it('holds items in review mode until accepted', async () => {
    const { hw, sent, post } = setup()
    await hw.openOnDevices(true)
    await post('ops', 1)
    expect(hw.board().items[0]).toMatchObject({ accepted: false })
    expect(updates(sent, 'accept')).toHaveLength(0)
    await hw.acceptItems([id(1)])
    expect(updates(sent, 'accept')).toHaveLength(1)
  })

  it('hides and restores without deleting from the log', async () => {
    const { hw, sent, logs, post } = setup()
    await hw.openOnDevices(false)
    await post('ops', 1)
    await hw.hideItems([id(1)])
    expect(updates(sent, 'hide')).toHaveLength(1)
    expect(hw.board().items[0]!.hidden).toBe(true)
    await hw.restoreItems([id(1)])
    expect(updates(sent, 'accept')).toHaveLength(2)
    expect(logs.filter((l) => l.kind === 'hotwash.item')).toHaveLength(1)
  })

  it('ignores a repeated item id from the same device and does not double count', async () => {
    const { hw, post } = setup()
    await hw.openOnDevices(false)
    await post('ops', 1)
    await post('ops', 1)
    expect(hw.board().items).toHaveLength(1)
  })

  it('refuses an item with empty or oversized text', async () => {
    const { hw, post } = setup()
    await hw.openOnDevices(false)
    await post('ops', 1, { text: '   ' })
    await post('ops', 2, { text: 'x'.repeat(2001) })
    expect(hw.board().items).toHaveLength(0)
  })
})

describe('+1 and withdrawing', () => {
  let t: ReturnType<typeof setup>
  beforeEach(async () => {
    t = setup()
    await t.hw.openOnDevices(false)
    await t.post('ops', 1)
  })

  it('counts one +1 per device and never for the author', async () => {
    await t.post('pio', 2, { plusOneOf: id(1), text: '' })
    await t.post('pio', 3, { plusOneOf: id(1), text: '' })
    await t.post('ops', 4, { plusOneOf: id(1), text: '' })
    expect(t.hw.board().items[0]!.plus).toBe(1)
    expect(updates(t.sent, 'tag')).toHaveLength(1)
    const plus = t.logs.find((l) => l.kind === 'hotwash.plus')!
    expect(plus.actor.seat).toBeUndefined()
  })

  it('lets the author withdraw within two minutes', async () => {
    await t.post('ops', 5, { retractOf: id(1), text: '' })
    expect(t.hw.board().items[0]).toMatchObject({ hidden: true })
    expect(updates(t.sent, 'hide')).toHaveLength(1)
    expect(t.logs.some((l) => l.kind === 'hotwash.retract')).toBe(true)
    await expect(t.hw.restoreItems([id(1)])).rejects.toThrow(/withdrew/)
  })

  it('refuses a late withdrawal', async () => {
    t.clock.advance(RETRACT_WINDOW_MS + 1)
    await t.post('ops', 5, { retractOf: id(1), text: '' })
    expect(t.hw.board().items[0]!.hidden).toBe(false)
  })

  it('refuses a withdrawal by someone else', async () => {
    await t.post('pio', 5, { retractOf: id(1), text: '' })
    expect(t.hw.board().items[0]!.hidden).toBe(false)
  })

  it('refuses to withdraw an item that was promoted', async () => {
    await t.hw.promote(id(1))
    await t.post('ops', 5, { retractOf: id(1), text: '' })
    expect(t.hw.board().items[0]!.hidden).toBe(false)
  })
})

describe('editing, grouping and tagging', () => {
  let t: ReturnType<typeof setup>
  beforeEach(async () => {
    t = setup()
    await t.hw.openOnDevices(false)
    await t.post('ops', 1)
    await t.post('pio', 2)
    await t.post('ev', 3, { kind: 'strength' })
  })

  it('keeps the original text when the facilitator edits', async () => {
    await t.hw.editItem(id(1), 'Two incident numbers')
    expect(t.hw.board().items[0]).toMatchObject({
      text: 'Two incident numbers',
      originalText: 'item 1',
    })
    const entry = t.logs.find((l) => l.data.action === 'edit')!
    expect(entry.data).toMatchObject({ before: 'item 1', after: 'Two incident numbers' })
    expect(updates(t.sent, 'edit')[0]!.payload.text).toBe('Two incident numbers')
  })

  it('groups items, labels the group and tells devices', async () => {
    await t.hw.groupItems([id(1), id(2)], 'Incident numbering')
    const board = t.hw.board()
    expect(board.groups).toHaveLength(1)
    expect(board.groups[0]).toMatchObject({ label: 'Incident numbering', promoted: false })
    expect(board.items.filter((i) => i.groupId === board.groups[0]!.groupId)).toHaveLength(2)
    expect(updates(t.sent, 'group').map((u) => u.payload.groupLabel)).toEqual([
      'Incident numbering',
      'Incident numbering',
    ])
  })

  it('merges groups when a selection touches two of them', async () => {
    await t.post('ops', 4)
    await t.hw.groupItems([id(1), id(2)])
    await t.hw.groupItems([id(3), id(4)])
    await t.hw.groupItems([id(1), id(3)], 'All')
    const board = t.hw.board()
    expect(board.groups).toHaveLength(1)
    expect(board.groups[0]!.itemIds).toHaveLength(4)
  })

  it('needs two items to group', async () => {
    await expect(t.hw.groupItems([id(1)])).rejects.toThrow(/at least two/)
  })

  it('dissolves a group left with one item', async () => {
    await t.hw.groupItems([id(1), id(2)])
    await t.hw.ungroupItems([id(1)])
    expect(t.hw.board().groups).toHaveLength(0)
    expect(t.hw.board().items.every((i) => !i.groupId)).toBe(true)
    expect(updates(t.sent, 'ungroup')).toHaveLength(2)
  })

  it('labels a group from any of its members', async () => {
    await t.hw.groupItems([id(1), id(2)])
    await t.hw.labelGroup(id(2), 'Renamed')
    expect(t.hw.board().groups[0]!.label).toBe('Renamed')
  })

  it('tags an item and clears a tag with null', async () => {
    await t.hw.tagItems([id(1)], { objectiveId: 'obj-1', mselRowId: 'I-06' })
    expect(t.hw.board().items[0]).toMatchObject({ objectiveId: 'obj-1', mselRowId: 'I-06' })
    await t.hw.tagItems([id(1)], { objectiveId: null })
    expect(t.hw.board().items[0]!.objectiveId).toBeUndefined()
  })
})

describe('promoting', () => {
  let t: ReturnType<typeof setup>
  beforeEach(async () => {
    t = setup()
    await t.hw.openOnDevices(false)
    await t.post('ops', 1, { kind: 'strength', objectiveId: 'obj-2', mselRowId: 'I-09' })
    await t.post('pio', 2)
    await t.post('ev', 3)
  })

  it('makes a facilitator-state entry for one item', async () => {
    const entry = await t.hw.promote(id(1))
    expect(entry).toMatchObject({
      id: `dev-${id(1)}`,
      kind: 'strength',
      text: 'item 1',
      objectiveRef: 'obj-2',
      rowId: 'I-09',
    })
    expect(t.hw.board().items[0]!.promoted).toBe(true)
    expect(t.logs.filter((l) => l.kind === 'hotwash.promoted')).toHaveLength(1)
  })

  it('uses the group label and a count for a group', async () => {
    await t.hw.groupItems([id(2), id(3)], 'Two incident numbers')
    const entry = await t.hw.promote(id(2))
    expect(entry.id).toBe(`dev-${t.hw.board().groups[0]!.groupId}`)
    expect(entry).toMatchObject({
      kind: 'improvement',
      text: 'Two incident numbers (2 contributions)',
    })
    expect(t.hw.board().groups[0]!.promoted).toBe(true)
    const logged = t.logs.filter((l) => l.kind === 'hotwash.promoted')
    expect(logged).toHaveLength(2)
    expect(logged[0]!.data.memberItemIds).toEqual([id(2), id(3)])
  })

  it('uses the first item text when the group has no label', async () => {
    await t.hw.groupItems([id(2), id(3)])
    expect((await t.hw.promote(id(3))).text).toBe('item 2 (2 contributions)')
  })

  it('unpromotes by the same id', async () => {
    await t.hw.promote(id(1))
    expect(await t.hw.unpromote(id(1))).toBe(`dev-${id(1)}`)
    expect(t.hw.board().items[0]!.promoted).toBe(false)
    expect(t.logs.some((l) => l.kind === 'hotwash.unpromoted')).toBe(true)
  })

  it('refuses to promote an item that is not on the board', async () => {
    const held = setup()
    await held.hw.openOnDevices(true)
    await held.post('ops', 1)
    await expect(held.hw.promote(id(1))).rejects.toThrow(/shown on the board/)
  })

  it('refuses to hide, edit or ungroup something promoted', async () => {
    await t.hw.groupItems([id(2), id(3)])
    await t.hw.promote(id(2))
    await expect(t.hw.ungroupItems([id(2)])).rejects.toThrow(/Unpromote/)
    await expect(t.hw.hideItems([id(3)])).rejects.toThrow(/Unpromote/)
    await expect(t.hw.editItem(id(3), 'x')).rejects.toThrow(/Unpromote/)
  })
})
