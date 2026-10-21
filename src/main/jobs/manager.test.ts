import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))
const { JobManager } = await import('./manager')

describe('JobManager', () => {
  it('runs jobs, streams tokens, and records results', async () => {
    const jm = new JobManager()
    const job = jm.start('ideate', async (ctx) => {
      ctx.progress(0.5, 'half')
      ctx.token('ideate', 'hello ')
      ctx.token('ideate', 'world')
      return { n: 1 }
    })
    const done = await jm.wait(job.id)
    expect(done.status).toBe('done')
    expect(done.result).toEqual({ n: 1 })
    expect(jm.logOf(job.id).tokens.ideate).toBe('hello world')
  })

  it('marks a queued job cancelled immediately', async () => {
    const jm = new JobManager()
    let release!: () => void
    const blocker = jm.start('generate-scenario', () => new Promise<void>((r) => (release = r)))
    const queued = jm.start('generate-scenario', async () => 'never')
    jm.cancel(queued.id)
    expect(jm.get(queued.id).status).toBe('cancelled')
    release()
    await jm.wait(blocker.id)
    await jm.wait(queued.id)
    expect(jm.get(queued.id).status).toBe('cancelled')
  })

  it('records errors without throwing', async () => {
    const jm = new JobManager()
    const job = jm.start('export', async () => {
      throw new Error('disk full')
    })
    expect((await jm.wait(job.id)).error).toBe('disk full')
  })
})
