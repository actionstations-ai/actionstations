// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import type { Job } from '@shared/schemas/job'
import { mockTtx } from '../routes/documents/test-utils'
import {
  connectJobs,
  interruptedJob,
  latestJob,
  pruneJobs,
  scenarioOwner,
  trackJob,
  useJobsStore,
  withDone,
  withJob,
  withProgress,
  type JobMap,
} from './jobs'

const job = (over: Partial<Job> = {}): Job => ({
  id: 'J1',
  kind: 'generate-injects',
  status: 'running',
  projectPath: '/p',
  scenarioId: 'S1',
  progress: 0.2,
  message: 'Writing I-01',
  createdAt: '2026-10-21T10:00:00.000Z',
  updatedAt: '2026-10-21T10:00:00.000Z',
  resumable: false,
  ...over,
})

const flush = () => new Promise((r) => setTimeout(r, 0))
let release: (() => void) | undefined
afterEach(() => {
  release?.()
  release = undefined
})

describe('job store reducers', () => {
  it('follows progress (with the items reached) and settles on done', () => {
    let j = withProgress(undefined, {
      jobId: 'J1',
      kind: 'generate-injects',
      status: 'running',
      progress: 0.1,
      message: 'I-01',
      itemId: 'i1',
    })
    j = withProgress(j, { ...j, jobId: 'J1', progress: 0.5, message: 'I-02', itemId: 'i2' })
    j = withProgress(j, { ...j, jobId: 'J1', progress: 0.6, message: 'I-01 again', itemId: 'i1' })
    expect(j.items).toEqual(['i2', 'i1'])
    expect(j.itemProgress.i2).toEqual({ progress: 0.5, message: 'I-02' })
    expect(j.known).toBe(false)
    const done = withDone(j, { jobId: 'J1', kind: 'generate-injects', status: 'done' })
    expect(done).toMatchObject({ status: 'done', progress: 1, message: 'Done' })
    // The final progress event (status 'error') waits for job:done and its error.
    expect(withProgress(j, { ...j, jobId: 'J1', status: 'error', message: 'x' }).status).toBe(
      'running',
    )
    // A late progress event never reopens a settled job.
    expect(withProgress(done, { ...j, jobId: 'J1', status: 'running' }).status).toBe('done')
  })

  it('takes meta from main but never moves a settled job back to running', () => {
    const settled = withDone(undefined, {
      jobId: 'J1',
      kind: 'export',
      status: 'error',
      error: 'x',
    })
    const merged = withJob(settled, job({ kind: 'export' }))
    expect(merged).toMatchObject({ status: 'error', projectPath: '/p', known: true })
  })

  it('a paused (interrupted) job does not own its scenario (#194)', () => {
    const jobs: JobMap = { J1: withJob(undefined, job({ status: 'paused', resumable: true })) }
    expect(scenarioOwner(jobs, '/p', 'S1')).toBeNull()
    expect(interruptedJob(jobs, '/p', 'S1')?.id).toBe('J1')
    jobs.J2 = withJob(undefined, job({ id: 'J2', status: 'queued' }))
    expect(scenarioOwner(jobs, '/p', 'S1')?.id).toBe('J2')
    expect(scenarioOwner(jobs, '/p', 'S2')).toBeNull()
  })

  it('an export of the scenario does not own it', () => {
    const jobs: JobMap = { J1: withJob(undefined, job({ kind: 'export' })) }
    expect(scenarioOwner(jobs, '/p', 'S1')).toBeNull()
    expect(latestJob(jobs, (j) => j.kind === 'export')?.id).toBe('J1')
  })

  it('keeps running jobs and the 50 newest finished ones', () => {
    const jobs: JobMap = {}
    for (let i = 0; i < 60; i++) {
      jobs[`D${i}`] = withDone(undefined, { jobId: `D${i}`, kind: 'export', status: 'done' })
    }
    jobs.R = withJob(undefined, job({ id: 'R' }))
    const kept = pruneJobs(jobs)
    expect(Object.keys(kept)).toHaveLength(51)
    expect(kept.R).toBeTruthy()
    expect(kept.D0).toBeUndefined()
    expect(kept.D59).toBeTruthy()
  })
})

describe('job store connection', () => {
  it('lists active jobs on connect, looks up unknown ones and empties on the last release', async () => {
    const ttx = mockTtx({
      'jobs:list': () => [job({ status: 'paused' })],
      'jobs:get': () => job({ id: 'J9', kind: 'ingest', scenarioId: undefined }),
    })
    release = connectJobs()
    await flush()
    expect(ttx.calls('jobs:list')).toEqual([{ activeOnly: true }])
    expect(useJobsStore.getState().jobs.J1?.status).toBe('paused')

    ttx.emit('job:progress', {
      jobId: 'J9',
      kind: 'ingest',
      status: 'running',
      progress: 0.3,
      message: 'Parsing',
    })
    await flush()
    expect(ttx.calls('jobs:get')).toEqual([{ jobId: 'J9' }])
    expect(useJobsStore.getState().jobs.J9).toMatchObject({ projectPath: '/p', known: true })

    ttx.emit('job:done', { jobId: 'J1', kind: 'generate-injects', status: 'cancelled' })
    expect(useJobsStore.getState().jobs.J1?.status).toBe('cancelled')

    release()
    release = undefined
    expect(useJobsStore.getState().jobs).toEqual({})
  })

  it('a job the window just started is known without a lookup', async () => {
    const ttx = mockTtx({ 'jobs:list': () => [] })
    release = connectJobs()
    trackJob('NEW', { kind: 'repair-scenario', projectPath: '/p', scenarioId: 'S1' })
    ttx.emit('job:progress', {
      jobId: 'NEW',
      kind: 'repair-scenario',
      status: 'running',
      progress: 0.5,
      message: 'Repairing',
    })
    await flush()
    expect(ttx.calls('jobs:get')).toEqual([])
    expect(scenarioOwner(useJobsStore.getState().jobs, '/p', 'S1')?.message).toBe('Repairing')
  })
})
