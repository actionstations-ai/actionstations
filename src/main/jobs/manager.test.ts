import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))
const { JobManager } = await import('./manager')
const { currentJob } = await import('./scope')
const { onEmit } = await import('../lib/events')

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

  it('runs each job inside its job scope (#433)', async () => {
    const jm = new JobManager()
    const job = jm.start('ideate', async () => currentJob(), { projectPath: '/tmp/p' })
    const done = await jm.wait(job.id)
    expect(done.result).toMatchObject({ jobId: job.id, projectPath: '/tmp/p' })
    expect(currentJob()).toBeUndefined()
  })

  it('marks a job waiting for a cloud approval and restores its message (#433)', async () => {
    const jm = new JobManager()
    const events: unknown[] = []
    const off = onEmit((name, payload) => {
      if (name === 'job:progress') events.push(payload)
    })
    let release!: () => void
    const job = jm.start('ideate', async (ctx) => {
      ctx.progress(0.2, 'Drafting')
      await new Promise<void>((r) => (release = r))
    })
    await new Promise((r) => setTimeout(r, 0))
    jm.setAwaiting(job.id, { kind: 'cloud-approval', requestId: 'r1' })
    expect(jm.get(job.id)).toMatchObject({
      status: 'running',
      message: 'Waiting for your approval',
      awaiting: { requestId: 'r1' },
    })
    expect(events.at(-1)).toMatchObject({ awaiting: { kind: 'cloud-approval', requestId: 'r1' } })
    jm.setAwaiting(job.id, undefined)
    expect(jm.get(job.id).awaiting).toBeUndefined()
    expect(jm.get(job.id).message).toBe('Drafting')
    release()
    await jm.wait(job.id)
    off()
  })

  it('records errors without throwing', async () => {
    const jm = new JobManager()
    const job = jm.start('export', async () => {
      throw new Error('disk full')
    })
    expect((await jm.wait(job.id)).error).toBe('disk full')
  })
})
