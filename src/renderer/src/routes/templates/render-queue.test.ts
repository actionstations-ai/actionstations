import { describe, expect, it } from 'vitest'
import { createRenderQueue } from './render-queue'

function deferred() {
  let resolve!: (v: string) => void
  const promise = new Promise<string>((r) => (resolve = r))
  return { promise, resolve }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('createRenderQueue (#1070)', () => {
  it('runs at most `limit` renders at once and starts the next as one finishes', async () => {
    const q = createRenderQueue(2)
    const jobs = [deferred(), deferred(), deferred()]
    const started: number[] = []
    const results = jobs.map((d, i) =>
      q.run(() => {
        started.push(i)
        return d.promise
      }),
    )
    expect(started).toEqual([0, 1])
    expect([q.running, q.waiting]).toEqual([2, 1])
    jobs[0]!.resolve('a')
    await tick()
    expect(started).toEqual([0, 1, 2])
    jobs[1]!.resolve('b')
    jobs[2]!.resolve('c')
    expect(await Promise.all(results)).toEqual(['a', 'b', 'c'])
    expect([q.running, q.waiting]).toEqual([0, 0])
  })

  it('starts a caller that is on screen before ones that were scrolled past', async () => {
    const q = createRenderQueue(1)
    const first = deferred()
    const started: string[] = []
    const job = (name: string) => () => {
      started.push(name)
      return Promise.resolve(name)
    }
    void q.run(() => first.promise)
    void q.run(job('scrolled past'), { isVisible: () => false })
    void q.run(job('on screen'), { isVisible: () => true })
    first.resolve('x')
    await tick()
    await tick()
    expect(started).toEqual(['on screen', 'scrolled past'])
  })

  it('drops a waiting call when it is aborted, but lets a started one finish', async () => {
    const q = createRenderQueue(1)
    const first = deferred()
    const running = new AbortController()
    const waiting = new AbortController()
    const a = q.run(() => first.promise, { signal: running.signal })
    let ran = false
    const b = q.run(
      () => {
        ran = true
        return Promise.resolve('b')
      },
      { signal: waiting.signal },
    )
    waiting.abort()
    running.abort()
    await expect(b).rejects.toMatchObject({ name: 'AbortError' })
    expect(q.waiting).toBe(0)
    first.resolve('a')
    expect(await a).toBe('a')
    expect(ran).toBe(false)
  })

  it('a failed render frees its slot', async () => {
    const q = createRenderQueue(1)
    const failed = q.run(() => Promise.reject(new Error('Render window crashed')))
    const next = q.run(() => Promise.resolve('ok'))
    await expect(failed).rejects.toThrow('Render window crashed')
    expect(await next).toBe('ok')
  })
})
