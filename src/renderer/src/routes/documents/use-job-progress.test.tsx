// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { Job } from '@shared/schemas/job'
import { withJob, withProgress, type JobMap } from '../../state/jobs'
import { useJobsConnection } from '../../state/use-jobs'
import { useExportJob } from '../export/use-export-job'
import { IngestJobs } from './IngestJobs'
import { INDEX_TARGET } from './job-progress'
import { mockTtx } from './test-utils'
import { liveFromJobs } from './use-job-progress'

const P = '/p'
const job = (over: Partial<Job>): Job => ({
  id: 'I1',
  kind: 'ingest',
  status: 'running',
  projectPath: P,
  progress: 0.25,
  message: 'Parsing',
  payload: { documentIds: ['d1', 'd2'], mode: 'ingest' },
  createdAt: '2026-10-21T10:00:00.000Z',
  updatedAt: '2026-10-21T10:00:00.000Z',
  resumable: false,
  ...over,
})

afterEach(() => cleanup())

describe('liveFromJobs', () => {
  it('maps a batch import per document and a rebuild onto the index', () => {
    let batch = withJob(undefined, job({}))
    const jobs: JobMap = { I1: batch }
    expect(liveFromJobs(jobs, P)).toEqual({
      d1: { jobId: 'I1', progress: 0.25, message: 'Parsing' },
      d2: { jobId: 'I1', progress: 0.25, message: 'Parsing' },
    })
    batch = withProgress(batch, {
      jobId: 'I1',
      kind: 'ingest',
      status: 'running',
      progress: 0.4,
      message: 'Chunking',
      stage: 'chunk',
      itemId: 'd1',
    })
    jobs.I1 = batch
    jobs.R1 = withJob(undefined, job({ id: 'R1', payload: { documentIds: ['d1'], mode: 'auto' } }))
    jobs.X = withJob(undefined, job({ id: 'X', projectPath: '/other' }))
    const live = liveFromJobs(jobs, P)
    expect(live.d1).toEqual({ jobId: 'I1', progress: 0.4, message: 'Chunking', stage: 'chunk' })
    expect(live.d2).toEqual({ jobId: 'I1', progress: 0, message: 'Queued' })
    expect(live[INDEX_TARGET]?.jobId).toBe('R1')
  })
})

describe('reattach after navigation (#197)', () => {
  it('a running import shows with Cancel when the Documents page mounts again', async () => {
    const ttx = mockTtx({ 'jobs:list': () => [job({})], 'jobs:cancel': () => undefined })
    function Page() {
      useJobsConnection()
      return <IngestJobs projectPath={P} />
    }
    render(<Page />)
    const list = await screen.findByRole('list', { name: 'Running imports' })
    expect(within(list).getByText('Importing 2 documents: Parsing')).toBeTruthy()
    await userEvent.click(within(list).getByRole('button', { name: /Cancel import/ }))
    expect(ttx.calls('jobs:cancel')).toEqual([{ jobId: 'I1' }])
  })

  it('the Export page picks up the running export of its scenario', async () => {
    const ttx = mockTtx({
      'jobs:list': () => [job({ id: 'E1', kind: 'export', scenarioId: 'S1', payload: undefined })],
    })
    const results: string[] = []
    function Page() {
      const { jobId, running } = useExportJob(P, 'S1', (e) =>
        results.push(`${e.status} ${JSON.stringify(e.result)}`),
      )
      return <p>{jobId ? `${jobId} ${running ? 'running' : 'idle'}` : 'none'}</p>
    }
    render(<Page />)
    expect(await screen.findByText('E1 running')).toBeTruthy()
    // Main's last progress event says 'done' before job:done brings the result.
    act(() =>
      ttx.emit('job:progress', {
        jobId: 'E1',
        kind: 'export',
        status: 'done',
        progress: 1,
        message: 'Done',
      }),
    )
    act(() =>
      ttx.emit('job:done', {
        jobId: 'E1',
        kind: 'export',
        status: 'done',
        result: { folder: 'x' },
      }),
    )
    await waitFor(() => expect(screen.getByText('E1 idle')).toBeTruthy())
    expect(results).toEqual(['done {"folder":"x"}'])
  })
})
