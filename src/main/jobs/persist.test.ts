import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Job } from '@shared/schemas'

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))
const { JobManager } = await import('./manager')
const { pauseInterrupted, readPersistedJobs } = await import('./persist')

let userData: string
beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'ttx-jobs-'))
  process.env.TTX_USER_DATA = userData
})
afterEach(() => {
  delete process.env.TTX_USER_DATA
})

const record = (over: Partial<Job>): Job => ({
  id: 'J1',
  kind: 'generate-scenario',
  status: 'running',
  projectPath: '/p',
  scenarioId: 'S1',
  progress: 0.4,
  message: 'msel',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:01.000Z',
  resumable: true,
  ...over,
})

describe('job persistence (#54)', () => {
  it('writes job records (without tokens or logs) on state changes', async () => {
    const jm = new JobManager()
    const job = jm.start('ideate', async (ctx) => {
      ctx.token('ideate', 'secret streamed text')
      ctx.log('a log line')
      return { n: 1 }
    })
    await jm.wait(job.id)
    await jm.flush()
    const file = join(userData, 'jobs.json')
    expect(existsSync(file)).toBe(true)
    const raw = readFileSync(file, 'utf8')
    expect(raw).toContain(job.id)
    expect(raw).toContain('"status": "done"')
    expect(raw).not.toContain('secret streamed text')
    expect(raw).not.toContain('a log line')
  })

  it('flush() writes synchronously, so a job that finished just before quit is not lost (#90)', async () => {
    const jm = new JobManager()
    const job = jm.start('ideate', async () => 'ok')
    await jm.wait(job.id)
    // before-quit cannot await: the file must be on disk when flush() returns.
    void jm.flush()
    const saved = JSON.parse(readFileSync(join(userData, 'jobs.json'), 'utf8')).jobs as Job[]
    expect(saved.find((j) => j.id === job.id)?.status).toBe('done')
  })

  it('marks interrupted jobs paused on the next start; resumable only with a checkpoint', () => {
    expect(pauseInterrupted(record({}))).toMatchObject({ status: 'paused', resumable: true })
    expect(pauseInterrupted(record({ kind: 'ingest' }))).toMatchObject({
      status: 'paused',
      resumable: false,
    })
    expect(pauseInterrupted(record({ scenarioId: undefined }))).toMatchObject({ resumable: false })
    expect(pauseInterrupted(record({ status: 'done' })).status).toBe('done')
  })

  it('lists restored jobs, resumes through the registered resumer and cancels paused ones', async () => {
    writeFileSync(
      join(userData, 'jobs.json'),
      JSON.stringify({
        jobs: [
          record({}),
          record({ id: 'J2', kind: 'ingest', status: 'queued' }),
          record({ id: 'J3', status: 'done' }),
        ],
      }),
    )
    expect(readPersistedJobs().map((j) => j.status)).toEqual(['paused', 'paused', 'done'])
    const jm = new JobManager()
    expect(jm.list({ activeOnly: true }).map((j) => j.id)).toEqual(['J1', 'J2'])
    expect(jm.get('J1')).toMatchObject({ status: 'paused', message: 'Interrupted — resumable' })
    await expect(jm.resume('J2')).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(jm.resume('J1')).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' })
    const resumed: Job[] = []
    jm.registerResumer('generate-scenario', async (paused) => {
      resumed.push(paused)
      return jm.start('generate-scenario', async () => 'ok', {
        projectPath: paused.projectPath!,
        scenarioId: paused.scenarioId!,
        resumable: true,
      })
    })
    const next = await jm.resume('J1')
    expect(resumed[0]?.id).toBe('J1')
    expect(next.scenarioId).toBe('S1')
    expect(() => jm.get('J1')).toThrow(/No job J1/)
    await jm.wait(next.id)
    jm.cancel('J2')
    expect(jm.get('J2')).toMatchObject({ status: 'cancelled', resumable: false })
    await jm.flush()
    const saved = JSON.parse(readFileSync(join(userData, 'jobs.json'), 'utf8')).jobs as Job[]
    expect(saved.map((j) => [j.id, j.status])).toEqual(
      expect.arrayContaining([
        [next.id, 'done'],
        ['J2', 'cancelled'],
        ['J3', 'done'],
      ]),
    )
    expect(saved.some((j) => j.id === 'J1')).toBe(false)
  })

  it('ignores a corrupt file and keeps working without persistence when no userData exists', () => {
    writeFileSync(join(userData, 'jobs.json'), '{not json')
    expect(readPersistedJobs()).toEqual([])
    delete process.env.TTX_USER_DATA
    const jm = new JobManager()
    expect(jm.list()).toEqual([])
  })
})
