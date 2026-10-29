import { describe, expect, it } from 'vitest'
import { MemoryOutboxStore, Outbox, type OutboxAction } from './queue'

const action = (
  id: string,
  createdAt: number,
): Omit<OutboxAction, 'sessionId' | 'createdAt'> & { createdAt: number } => ({
  id,
  type: 'inject.receipt',
  to: 'controller',
  payload: { releaseId: id, status: 'read', at: createdAt },
  createdAt,
})

describe('Outbox', () => {
  function make(online = true) {
    const store = new MemoryOutboxStore()
    const sent: string[] = []
    let fail = false
    const state = { online }
    const outbox = new Outbox(
      store,
      'session-A',
      async (a) => {
        if (fail) throw new Error('offline')
        sent.push(a.id)
      },
      () => state.online,
    )
    return { store, sent, outbox, state, setFail: (v: boolean) => (fail = v) }
  }

  it('sends at once while online and keeps nothing', async () => {
    const { outbox, sent, store } = make()
    await outbox.enqueue(action('r1', 1), 1)
    expect(sent).toEqual(['r1'])
    expect(await store.list('session-A')).toEqual([])
  })

  it('holds actions while offline and drains them oldest first on reconnect', async () => {
    const { outbox, sent, state } = make(false)
    await outbox.enqueue(action('r2', 20), 20)
    await outbox.enqueue(action('r1', 10), 10)
    expect(sent).toEqual([])
    expect((await outbox.pending()).map((a) => a.id)).toEqual(['r1', 'r2'])
    state.online = true
    expect(await outbox.drain()).toBe(2)
    expect(sent).toEqual(['r1', 'r2'])
    expect(await outbox.pending()).toEqual([])
  })

  it('stops at the first failure and keeps the rest for the next drain (idempotent ids)', async () => {
    const { outbox, sent, state, setFail } = make(false)
    await outbox.enqueue(action('a', 1), 1)
    await outbox.enqueue(action('b', 2), 2)
    state.online = true
    setFail(true)
    expect(await outbox.drain()).toBe(0)
    expect((await outbox.pending()).map((a) => a.id)).toEqual(['a', 'b'])
    setFail(false)
    expect(await outbox.drain()).toBe(2)
    expect(sent).toEqual(['a', 'b'])
  })

  it('keeps sessions apart and clears only its own', async () => {
    const store = new MemoryOutboxStore()
    await store.put({ ...action('x', 1), sessionId: 'other' })
    const outbox = new Outbox(
      store,
      'session-A',
      async () => {},
      () => false,
    )
    await outbox.enqueue(action('y', 2), 2)
    expect((await outbox.pending()).map((a) => a.id)).toEqual(['y'])
    await outbox.clear()
    expect(await store.list('other')).toHaveLength(1)
    expect(await outbox.pending()).toEqual([])
  })

  it('two concurrent drains share one run', async () => {
    const { outbox, sent, state } = make(false)
    await outbox.enqueue(action('a', 1), 1)
    state.online = true
    const [n1, n2] = await Promise.all([outbox.drain(), outbox.drain()])
    expect(n1 + n2).toBe(2) // the same promise resolves for both callers
    expect(sent).toEqual(['a'])
  })
})
