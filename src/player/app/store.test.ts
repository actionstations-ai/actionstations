import { describe, expect, it } from 'vitest'
import { Store } from './store'

describe('Store', () => {
  it('notifies on a change and not when every value is identical', () => {
    const store = new Store({ a: 1, list: [1] })
    let calls = 0
    store.subscribe(() => calls++)
    store.set({ a: 1 })
    expect(calls).toBe(0)
    store.set({ a: 2 })
    expect(calls).toBe(1)
    store.set((s) => ({ list: s.list }))
    expect(calls).toBe(1)
    store.set((s) => ({ list: [...s.list, 2] }))
    expect(calls).toBe(2)
    expect(store.get()).toEqual({ a: 2, list: [1, 2] })
  })

  it('unsubscribes', () => {
    const store = new Store({ n: 0 })
    let calls = 0
    const off = store.subscribe(() => calls++)
    store.set({ n: 1 })
    off()
    store.set({ n: 2 })
    expect(calls).toBe(1)
  })
})
