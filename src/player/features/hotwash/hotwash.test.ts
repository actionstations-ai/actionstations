import { describe, expect, it } from 'vitest'
import type { HotwashUpdatePayload } from '../../../shared/live/schemas'
import {
  EMPTY_HOTWASH,
  WITHDRAW_MS,
  addOwn,
  addPlusMine,
  applyUpdate,
  boardRows,
  canWithdraw,
  removeOwn,
  setOpen,
  shownCount,
  waitingOwn,
} from './hotwash'

const id = (n: number) => String(n).padStart(22, 'A')
const update = (over: Partial<HotwashUpdatePayload>): HotwashUpdatePayload =>
  ({ itemId: id(1), action: 'accept', ...over }) as HotwashUpdatePayload
const accept = (n: number, text: string, extra: Partial<HotwashUpdatePayload> = {}) =>
  update({ itemId: id(n), action: 'accept', text, kind: 'improvement', ...extra })

describe('hot wash board state', () => {
  it('opens and closes without touching the board', () => {
    const open = setOpen(EMPTY_HOTWASH, true)
    expect(open.open).toBe(true)
    expect(setOpen(open, true)).toBe(open)
  })

  it('shows an accepted item with the sender role', () => {
    const s = applyUpdate(EMPTY_HOTWASH, accept(1, 'Two numbers', { roleId: 'pio' }))
    expect(s.items[id(1)]).toMatchObject({ text: 'Two numbers', roleId: 'pio', shown: true })
  })

  it('shows an item without a role as anonymous', () => {
    const s = applyUpdate(EMPTY_HOTWASH, accept(1, 'Which number?'))
    expect(s.items[id(1)]!.roleId).toBeUndefined()
  })

  it('keeps an own item waiting until the controller shows it, then marks it shown', () => {
    const posted = addOwn(
      EMPTY_HOTWASH,
      { itemId: id(1), kind: 'strength', text: 'Clear PA', anonymous: false, roleId: 'ops' },
      1000,
    )
    expect(waitingOwn(posted)).toHaveLength(1)
    expect(shownCount(posted)).toBe(0)
    const shown = applyUpdate(posted, accept(1, 'Clear PA', { kind: 'strength', roleId: 'ops' }))
    expect(waitingOwn(shown)).toHaveLength(0)
    expect(shown.items[id(1)]).toMatchObject({ mine: true, shown: true })
  })

  it('does not attach the role to an own item posted anonymously', () => {
    const s = addOwn(
      EMPTY_HOTWASH,
      { itemId: id(1), kind: 'other', text: 'x', anonymous: true, roleId: 'ops' },
      1,
    )
    expect(s.items[id(1)]!.roleId).toBeUndefined()
  })

  it('removes an item that is hidden', () => {
    const s = applyUpdate(applyUpdate(EMPTY_HOTWASH, accept(1, 'a')), update({ action: 'hide' }))
    expect(s.items[id(1)]).toBeUndefined()
  })

  it('applies edits, counts, group, ungroup and promotion', () => {
    let s = applyUpdate(EMPTY_HOTWASH, accept(1, 'typo'))
    s = applyUpdate(s, update({ action: 'edit', text: 'fixed' }))
    s = applyUpdate(s, update({ action: 'tag', plus: 4 }))
    s = applyUpdate(s, update({ action: 'group', groupId: id(9), groupLabel: 'Numbers' }))
    s = applyUpdate(s, update({ action: 'promote' }))
    expect(s.items[id(1)]).toMatchObject({
      text: 'fixed',
      plus: 4,
      groupId: id(9),
      groupLabel: 'Numbers',
      promoted: true,
    })
    s = applyUpdate(s, update({ action: 'ungroup' }))
    s = applyUpdate(s, update({ action: 'unpromote' }))
    expect(s.items[id(1)]!.groupId).toBeUndefined()
    expect(s.items[id(1)]!.promoted).toBe(false)
  })

  it('ignores an update for an item it has never seen', () => {
    expect(applyUpdate(EMPTY_HOTWASH, update({ action: 'edit', text: 'x' }))).toBe(EMPTY_HOTWASH)
  })

  it('counts a +1 once and never on the own item', () => {
    let s = applyUpdate(EMPTY_HOTWASH, accept(1, 'a'))
    s = addPlusMine(addPlusMine(s, id(1)), id(1))
    expect(s.items[id(1)]).toMatchObject({ plus: 1, plusMine: true })
    const own = addOwn(
      EMPTY_HOTWASH,
      { itemId: id(2), kind: 'other', text: 'b', anonymous: false },
      1,
    )
    expect(addPlusMine(own, id(2))).toBe(own)
  })

  it('lets the controller count replace the optimistic one', () => {
    let s = addPlusMine(applyUpdate(EMPTY_HOTWASH, accept(1, 'a')), id(1))
    s = applyUpdate(s, update({ action: 'tag', plus: 3 }))
    expect(s.items[id(1)]!.plus).toBe(3)
  })

  it('allows withdrawing only own, unpromoted items for two minutes', () => {
    const own = addOwn(
      EMPTY_HOTWASH,
      { itemId: id(1), kind: 'other', text: 'a', anonymous: false },
      1000,
    )
    const entry = own.items[id(1)]!
    expect(canWithdraw(entry, 1000 + WITHDRAW_MS)).toBe(true)
    expect(canWithdraw(entry, 1001 + WITHDRAW_MS)).toBe(false)
    expect(canWithdraw({ ...entry, promoted: true }, 1000)).toBe(false)
    expect(canWithdraw({ ...entry, mine: false }, 1000)).toBe(false)
    expect(removeOwn(own, id(1)).items).toEqual({})
  })
})

describe('boardRows', () => {
  it('sorts by +1, treats a group as one row with the summed count, and skips unshown items', () => {
    let s = applyUpdate(EMPTY_HOTWASH, accept(1, 'solo'))
    s = applyUpdate(s, accept(2, 'one'))
    s = applyUpdate(s, accept(3, 'two'))
    s = applyUpdate(s, update({ itemId: id(1), action: 'tag', plus: 2 }))
    for (const n of [2, 3]) {
      s = applyUpdate(s, update({ itemId: id(n), action: 'tag', plus: 2 }))
      s = applyUpdate(s, update({ itemId: id(n), action: 'group', groupId: id(9) }))
    }
    s = addOwn(s, { itemId: id(4), kind: 'other', text: 'waits', anonymous: false }, 1)
    const rows = boardRows(s)
    expect(rows.map((r) => r.type)).toEqual(['group', 'item'])
    expect(rows[0]!.plus).toBe(4)
    expect(shownCount(s)).toBe(3)
  })
})
