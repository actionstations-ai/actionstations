import { describe, expect, it } from 'vitest'
import { Outbox, MemoryOutboxStore, type OutboxAction } from '../../app/queue'
import { EvalObservationPayload } from '../../../shared/live/schemas'
import { EvaluatorFeature, pendingCount } from './evaluator'
import {
  MAX_LOCAL_OBSERVATIONS,
  MemoryObservationStore,
  ObservationBook,
  toPayload,
} from './observations'

function book(store = new MemoryObservationStore()) {
  let n = 0
  return {
    store,
    book: new ObservationBook(
      store,
      'session-1',
      () => `id${String(++n).padStart(20, '0')}`,
      () => 1_000,
    ),
  }
}

const rating = (taskId: string, over: object = {}) => ({
  kind: 'task' as const,
  taskId,
  rating: 'met' as const,
  notes: '',
  exerciseTime: '1:12',
  ...over,
})

describe('ObservationBook', () => {
  it('revises one observation per task in place, raising the revision each save', async () => {
    const { book: b } = book()
    const first = await b.save(rating('T-01'))
    const second = await b.save(rating('T-01', { rating: 'partial', notes: 'edit' }))
    if (!first.ok || !second.ok) throw new Error('save failed')
    expect(second.observation.observationId).toBe(first.observation.observationId)
    expect(second.observation.revision).toBe(2)
    expect(b.all()).toHaveLength(1)
    expect(b.forTask('T-01')).toMatchObject({ rating: 'partial', notes: 'edit' })
  })

  it('keeps general notes apart, each with its own id', async () => {
    const { book: b } = book()
    await b.save({ kind: 'note', notes: 'one', exerciseTime: '1:00' })
    await b.save({ kind: 'note', notes: 'two', exerciseTime: '1:01' })
    expect(new Set(b.all().map((o) => o.observationId)).size).toBe(2)
  })

  it('counts what is waiting to send and clears it as the connection takes each revision', async () => {
    const { book: b } = book()
    const r = await b.save(rating('T-01'))
    if (!r.ok) throw new Error('save failed')
    expect(b.pending()).toBe(1)
    await b.markSent(r.observation.observationId, 1)
    expect(b.pending()).toBe(0)
    await b.save(rating('T-01', { rating: 'not_met' }))
    expect(b.pending()).toBe(1)
    // A late "sent" for revision 1 must not hide revision 2.
    await b.markSent(r.observation.observationId, 1)
    expect(b.pending()).toBe(1)
  })

  it('survives a reload: the revision counter and ratings come back from the store', async () => {
    const { store, book: b } = book()
    await b.save(rating('T-01'))
    await b.save(rating('T-01', { rating: 'partial' }))
    const { book: reloaded } = book(store)
    await reloaded.load()
    expect(reloaded.forTask('T-01')).toMatchObject({ revision: 2, rating: 'partial' })
    const next = await reloaded.save(rating('T-01', { rating: 'met' }))
    expect(next.ok && next.observation.revision).toBe(3)
  })

  it('stops taking new observations at the cap but still revises existing ones', async () => {
    const { book: b } = book()
    for (let i = 0; i < MAX_LOCAL_OBSERVATIONS; i++) await b.save(rating(`T-${i}`))
    expect(await b.save(rating('T-extra'))).toEqual({ ok: false, reason: 'limit' })
    expect((await b.save(rating('T-0', { rating: 'not_met' }))).ok).toBe(true)
  })

  it('trims a note to the protocol cap and builds a payload the protocol accepts', async () => {
    const { book: b } = book()
    const r = await b.save(rating('T-01', { notes: 'x'.repeat(5000), mselRowId: 'I-06' }))
    if (!r.ok) throw new Error('save failed')
    expect(r.observation.notes).toHaveLength(4000)
    const payload = toPayload({ ...r.observation, observationId: 'A'.repeat(22) })
    expect(EvalObservationPayload.safeParse(payload).success).toBe(true)
    expect(payload).not.toHaveProperty('sessionId')
    expect(payload).not.toHaveProperty('sentRevision')
  })
})

describe('offline outbox for observations', () => {
  function feature() {
    let online = false
    const sent: OutboxAction[] = []
    const outbox = new Outbox(
      new MemoryOutboxStore(),
      'session-1',
      async (a) => void sent.push(a),
      () => online,
    )
    let clock = 5_000
    let n = 0
    const f = new EvaluatorFeature({
      sessionId: 'session-1',
      store: new MemoryObservationStore(),
      newId: () => `id${String(++n).padStart(20, '0')}`,
      now: () => clock, // the same millisecond for every save
      exerciseTime: () => '1:12',
      enqueue: ({ id, payload, createdAt }) =>
        outbox.enqueue({ id, type: 'eval.observation', to: 'controller', payload }, createdAt),
    })
    return {
      f,
      outbox,
      sent,
      goOnline: () => (online = true),
      tick: () => (clock += 1),
    }
  }

  it('keeps ten ratings made offline, sends them once and in the order they were made', async () => {
    const { f, outbox, sent, goOnline } = feature()
    for (let i = 1; i <= 10; i++) {
      await f.save(rating(`T-${String(i).padStart(2, '0')}`))
    }
    expect(sent).toEqual([])
    expect(pendingCount(f.state.get().observations)).toBe(10)
    goOnline()
    expect(await outbox.drain()).toBe(10)
    expect(sent.map((a) => a.payload.taskId)).toEqual(
      Array.from({ length: 10 }, (_, i) => `T-${String(i + 1).padStart(2, '0')}`),
    )
    expect(await outbox.drain()).toBe(0)
    expect(sent).toHaveLength(10)
  })

  it('sends every revision of an edited observation in order, so the controller keeps the last', async () => {
    const { f, outbox, sent, goOnline } = feature()
    await f.save(rating('T-01', { rating: 'not_met' }))
    await f.save(rating('T-01', { rating: 'met' }))
    goOnline()
    await outbox.drain()
    expect(sent.map((a) => [a.payload.revision, a.payload.rating])).toEqual([
      [1, 'not_met'],
      [2, 'met'],
    ])
    expect(new Set(sent.map((a) => a.payload.observationId)).size).toBe(1)
  })

  it('refuses a save after the session ended', async () => {
    const { f } = feature()
    f.end()
    expect(await f.save(rating('T-01'))).toEqual({ ok: false, reason: 'ended' })
  })

  it('marks a revision sent so the form stops saying it is waiting', async () => {
    const { f } = feature()
    const r = await f.save(rating('T-01'))
    if (!r.ok) throw new Error('save failed')
    await f.markSent(r.observation.observationId, 1)
    expect(pendingCount(f.state.get().observations)).toBe(0)
  })
})
