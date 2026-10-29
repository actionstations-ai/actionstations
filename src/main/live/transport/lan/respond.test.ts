import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { drained } from './respond'

/** A response with the bits `drained` reads. */
class FakeRes extends EventEmitter {
  destroyed = false
  writableEnded = false
}

const settled = (p: Promise<void>) =>
  Promise.race([p.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 50))])

describe('drained (#457 review follow-up: a download slot is released when the reader leaves)', () => {
  it('resolves on drain, on close and on error, and at once for a finished response', async () => {
    const byDrain = new FakeRes()
    const waitDrain = drained(byDrain as never)
    expect(await settled(Promise.race([waitDrain, new Promise<void>(() => {})]))).toBe(false)
    byDrain.emit('drain')
    expect(await settled(waitDrain)).toBe(true)

    const byClose = new FakeRes()
    const waitClose = drained(byClose as never)
    byClose.emit('close')
    expect(await settled(waitClose)).toBe(true)

    const byError = new FakeRes()
    const waitError = drained(byError as never)
    byError.emit('error', new Error('reset'))
    expect(await settled(waitError)).toBe(true)
    expect(byError.listenerCount('drain')).toBe(0)

    const gone = new FakeRes()
    gone.destroyed = true
    expect(await settled(drained(gone as never))).toBe(true)
  })
})
