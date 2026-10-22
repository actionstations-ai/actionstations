// Generic worker pool used by the render windows (ADR-0008). Kept free of Electron so its
// scheduling, recycling, crash recovery and timeouts are unit-testable with fake workers.
//
// - At most `size` workers exist; jobs beyond that wait in FIFO order.
// - Workers are keyed (the render window's zoom factor): an idle worker is reused only for
//   jobs with the same key; a mismatched idle worker is destroyed to make room.
// - A worker is recycled after `maxUses` jobs, when it reports itself dead (renderer crash),
//   when its job times out, or when `reset` fails.
import { AppError } from '../lib/errors'

export interface PoolDriver<W> {
  create(key: string): Promise<W>
  /** Return a worker to a clean state between jobs. Throwing recycles the worker. */
  reset(worker: W): Promise<void>
  destroy(worker: W): void
  isAlive(worker: W): boolean
  /** Subscribe to the worker dying mid-job (e.g. render-process-gone). Returns unsubscribe. */
  onDeath(worker: W, cb: (reason: string) => void): () => void
}

export interface PoolOptions {
  size: number
  maxUses: number
  timeoutMs: number
}

interface Slot<W> {
  key: string
  worker: W
  uses: number
  busy: boolean
}

interface Waiter {
  key: string
  wake: () => void
}

export interface PoolStats {
  workers: number
  busy: number
  waiting: number
  created: number
  destroyed: number
}

export class WorkerPool<W> {
  private slots: Slot<W>[] = []
  private pending = 0
  private waiters: Waiter[] = []
  private created = 0
  private destroyed = 0

  constructor(
    private readonly driver: PoolDriver<W>,
    private opts: PoolOptions,
  ) {}

  configure(opts: Partial<PoolOptions>): void {
    this.opts = { ...this.opts, ...opts }
  }

  get options(): PoolOptions {
    return { ...this.opts }
  }

  stats(): PoolStats {
    return {
      workers: this.slots.length,
      busy: this.slots.filter((s) => s.busy).length,
      waiting: this.waiters.length,
      created: this.created,
      destroyed: this.destroyed,
    }
  }

  /** Run one job on a worker for `key`, with the pool's timeout and crash handling. */
  async run<T>(key: string, job: (worker: W) => Promise<T>): Promise<T> {
    const slot = await this.acquire(key)
    let healthy = true
    try {
      return await this.guarded(slot, job)
    } catch (e) {
      healthy = false
      throw e
    } finally {
      await this.release(slot, healthy)
    }
  }

  /** Destroy every idle worker (busy ones are destroyed when their job ends). */
  drain(): void {
    for (const s of this.slots.filter((x) => !x.busy)) this.remove(s)
  }

  private async guarded<T>(slot: Slot<W>, job: (worker: W) => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    let unsubscribe = (): void => undefined
    const failure = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new AppError('INTERNAL', `Render timed out after ${this.opts.timeoutMs} ms`)),
        this.opts.timeoutMs,
      )
      unsubscribe = this.driver.onDeath(slot.worker, (reason) =>
        reject(new AppError('INTERNAL', `Render window crashed (${reason})`)),
      )
    })
    try {
      return await Promise.race([job(slot.worker), failure])
    } finally {
      clearTimeout(timer)
      unsubscribe()
    }
  }

  private async acquire(key: string): Promise<Slot<W>> {
    for (;;) {
      const idle = this.slots.find((s) => !s.busy && s.key === key && this.driver.isAlive(s.worker))
      if (idle) {
        idle.busy = true
        return idle
      }
      this.evictIdleMismatch()
      if (this.slots.length + this.pending < this.opts.size) return this.spawn(key)
      await new Promise<void>((wake) => this.waiters.push({ key, wake }))
    }
  }

  /** Free capacity by destroying an idle worker that is dead or keyed differently. */
  private evictIdleMismatch(): void {
    if (this.slots.length + this.pending < this.opts.size) return
    const victim = this.slots.find((s) => !s.busy)
    if (victim) this.remove(victim)
  }

  private async spawn(key: string): Promise<Slot<W>> {
    this.pending++
    try {
      const worker = await this.driver.create(key)
      this.created++
      const slot: Slot<W> = { key, worker, uses: 0, busy: true }
      this.slots.push(slot)
      return slot
    } finally {
      this.pending--
      if (this.slots.length + this.pending < this.opts.size) this.wakeNext()
    }
  }

  private async release(slot: Slot<W>, healthy: boolean): Promise<void> {
    slot.uses++
    let keep = healthy && slot.uses < this.opts.maxUses && this.driver.isAlive(slot.worker)
    if (keep) {
      try {
        await this.driver.reset(slot.worker)
      } catch {
        keep = false
      }
    }
    if (keep && this.slots.length <= this.opts.size) slot.busy = false
    else this.remove(slot)
    this.wakeNext()
  }

  private remove(slot: Slot<W>): void {
    const i = this.slots.indexOf(slot)
    if (i < 0) return
    this.slots.splice(i, 1)
    this.destroyed++
    try {
      this.driver.destroy(slot.worker)
    } catch {
      // Already gone (crashed); nothing to release.
    }
  }

  /** Prefer a waiter whose key matches an idle worker; otherwise the oldest waiter. */
  private wakeNext(): void {
    if (!this.waiters.length) return
    const idleKeys = new Set(this.slots.filter((s) => !s.busy).map((s) => s.key))
    let i = this.waiters.findIndex((w) => idleKeys.has(w.key))
    if (i < 0) i = 0
    const [w] = this.waiters.splice(i, 1)
    w!.wake()
  }
}
