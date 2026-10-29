import { describe, expect, it } from 'vitest'
import { MemoryKeyValue } from '../../../shared/live/transport'
import { EMPTY_HOTWASH, addOwn, applyUpdate } from './hotwash'
import { loadOwnItems, ownItemsKey, restoreOwn, saveOwnItems } from './own-items'

const SESSION = 'AAAAAAAAAAAAAAAAAAAAAA'

const posted = () =>
  addOwn(
    EMPTY_HOTWASH,
    {
      itemId: 'item-1',
      kind: 'strength',
      text: 'Clear PA script',
      anonymous: false,
      roleId: 'ops',
    },
    1_000,
  )

describe('own hot wash items across a reload', () => {
  it('keeps what this device posted and marks it as its own again', () => {
    const storage = new MemoryKeyValue()
    saveOwnItems(storage, SESSION, posted())
    const back = restoreOwn(EMPTY_HOTWASH, loadOwnItems(storage, SESSION))
    expect(back.items['item-1']).toMatchObject({
      mine: true,
      shown: false,
      text: 'Clear PA script',
      roleId: 'ops',
      postedAt: 1_000,
    })
  })

  it('does not keep other devices items, and keeps the marker when the controller shows it', () => {
    const storage = new MemoryKeyValue()
    const withOther = applyUpdate(posted(), {
      itemId: 'item-2',
      action: 'accept',
      kind: 'other',
      text: 'Someone else',
    } as never)
    saveOwnItems(storage, SESSION, withOther)
    expect(loadOwnItems(storage, SESSION).map((e) => e.itemId)).toEqual(['item-1'])
    const shown = applyUpdate(restoreOwn(EMPTY_HOTWASH, loadOwnItems(storage, SESSION)), {
      itemId: 'item-1',
      action: 'accept',
      kind: 'strength',
      text: 'Clear PA script',
    } as never)
    expect(shown.items['item-1']).toMatchObject({ mine: true, shown: true })
  })

  it('stores nothing once there is nothing to keep', () => {
    const storage = new MemoryKeyValue()
    saveOwnItems(storage, SESSION, posted())
    saveOwnItems(storage, SESSION, EMPTY_HOTWASH)
    expect(storage.get(ownItemsKey(SESSION))).toBeFalsy()
  })

  it('ignores damaged storage', () => {
    const storage = new MemoryKeyValue()
    storage.set(ownItemsKey(SESSION), '{not json')
    expect(loadOwnItems(storage, SESSION)).toEqual([])
    storage.set(
      ownItemsKey(SESSION),
      JSON.stringify([{ itemId: 5 }, { itemId: 'x', text: 't', kind: 'bad' }]),
    )
    expect(loadOwnItems(storage, SESSION)).toEqual([])
  })
})
