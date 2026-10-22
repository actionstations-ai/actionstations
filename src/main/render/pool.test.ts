import { describe, expect, it } from 'vitest'
import { WorkerPool, type PoolDriver, type PoolOptions } from './pool'

interface FakeWorker {
  id: number
  key: string
  alive: boolean
  jobs: number
  resets: number
  die?: (reason: string) => void
}

function fakeDriver(opts: { failReset?: boolean } = {}) {
  let next = 0
  const all: FakeWorker[] = []
  const destroyed: FakeWorker[] = []
  const driver: PoolDriver<FakeWorker> = {
    create: async (key) => {
      const w: FakeWorker = { id: ++next, key, alive: true, jobs: 0, resets: 0 }
      all.push(w)
      return w
    },
    reset: async (w) => {
      if (opts.failReset) throw new Error('reset failed')
      w.resets++
    },
    destroy: (w) => {
      w.alive = false
      destroyed.push(w)
    },
    isAlive: (w) => w.alive,
    onDeath: (w, cb) => {
      w.die = (reason) => {
        w.alive = false
        cb(reason)
      }
      return () => {
        delete w.die
      }
    },
  }
  return { driver, all, destroyed }
}

const opts = (o: Partial<PoolOptions> = {}): PoolOptions => ({
  size: 2,
  maxUses: 100,
  timeoutMs: 1000,
  ...o,
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('WorkerPool', () => {
  it('never runs more than `size` jobs at once and reuses warm workers', async () => {
    const { driver, all } = fakeDriver()
    const pool = new WorkerPool(driver, opts({ size: 2 }))
    let running = 0
    let peak = 0
    const job = async (w: FakeWorker) => {
      running++
      peak = Math.max(peak, running)
      await sleep(5)
      w.jobs++
      running--
      return w.id
    }
    const ids = await Promise.all(Array.from({ length: 10 }, () => pool.run('2', job)))
    expect(peak).toBe(2)
    expect(all).toHaveLength(2)
    expect(new Set(ids)).toEqual(new Set([1, 2]))
    expect(all.reduce((n, w) => n + w.jobs, 0)).toBe(10)
    expect(all.every((w) => w.resets === w.jobs)).toBe(true)
    expect(pool.stats()).toMatchObject({ workers: 2, busy: 0, waiting: 0 })
  })

  it('recycles a worker after maxUses jobs', async () => {
    const { driver, all, destroyed } = fakeDriver()
    const pool = new WorkerPool(driver, opts({ size: 1, maxUses: 3 }))
    for (let i = 0; i < 7; i++) await pool.run('2', async (w) => w.id)
    expect(all.map((w) => w.id)).toEqual([1, 2, 3])
    expect(destroyed.map((w) => w.id)).toEqual([1, 2])
  })

  it('replaces a worker whose renderer crashes mid-job and keeps serving', async () => {
    const { driver, all, destroyed } = fakeDriver()
    const pool = new WorkerPool(driver, opts({ size: 1 }))
    const crashed = pool.run('2', async (w) => {
      setTimeout(() => w.die?.('crashed'), 5)
      await sleep(200)
      return 'never'
    })
    await expect(crashed).rejects.toThrow(/crashed \(crashed\)/)
    expect(destroyed.map((w) => w.id)).toEqual([1])
    await expect(pool.run('2', async (w) => w.id)).resolves.toBe(2)
    expect(all).toHaveLength(2)
  })

  it('drops a dead idle worker instead of reusing it', async () => {
    const { driver } = fakeDriver()
    const pool = new WorkerPool(driver, opts({ size: 1 }))
    const first = await pool.run('2', async (w) => w)
    first.alive = false
    await expect(pool.run('2', async (w) => w.id)).resolves.toBe(2)
  })

  it('times out a stuck job with a clear error and frees the slot', async () => {
    const { driver, destroyed } = fakeDriver()
    const pool = new WorkerPool(driver, opts({ size: 1, timeoutMs: 20 }))
    await expect(pool.run('2', () => new Promise(() => undefined))).rejects.toThrow(
      /timed out after 20 ms/,
    )
    expect(destroyed).toHaveLength(1)
    await expect(pool.run('2', async () => 'ok')).resolves.toBe('ok')
  })

  it('recycles a worker when its job throws or reset fails', async () => {
    const thrown = fakeDriver()
    const pool = new WorkerPool(thrown.driver, opts({ size: 1 }))
    await expect(
      pool.run('2', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(thrown.destroyed).toHaveLength(1)

    const badReset = fakeDriver({ failReset: true })
    const pool2 = new WorkerPool(badReset.driver, opts({ size: 1 }))
    await pool2.run('2', async () => 1)
    await pool2.run('2', async () => 1)
    expect(badReset.all).toHaveLength(2)
  })

  it('keys workers by zoom and swaps an idle worker of another key when full', async () => {
    const { driver, all, destroyed } = fakeDriver()
    const pool = new WorkerPool(driver, opts({ size: 1 }))
    await pool.run('2', async () => 1)
    await pool.run('1', async (w) => expect(w.key).toBe('1'))
    await pool.run('1', async () => 1)
    expect(all.map((w) => w.key)).toEqual(['2', '1'])
    expect(destroyed.map((w) => w.key)).toEqual(['2'])
  })

  it('mixed keys under load all complete within capacity', async () => {
    const { driver } = fakeDriver()
    const pool = new WorkerPool(driver, opts({ size: 2 }))
    let running = 0
    let peak = 0
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        pool.run(i % 3 === 0 ? '1' : '2', async (w) => {
          running++
          peak = Math.max(peak, running)
          await sleep(2)
          running--
          return w.key
        }),
      ),
    )
    expect(peak).toBeLessThanOrEqual(2)
    expect(results.filter((k) => k === '1')).toHaveLength(4)
    expect(pool.stats().waiting).toBe(0)
  })

  it('shrinks when reconfigured to a smaller size', async () => {
    const { driver } = fakeDriver()
    const pool = new WorkerPool(driver, opts({ size: 2 }))
    await Promise.all([pool.run('2', () => sleep(5)), pool.run('2', () => sleep(5))])
    expect(pool.stats().workers).toBe(2)
    pool.configure({ size: 1 })
    await pool.run('2', async () => 1)
    expect(pool.stats().workers).toBe(1)
    pool.drain()
    expect(pool.stats().workers).toBe(0)
  })
})
