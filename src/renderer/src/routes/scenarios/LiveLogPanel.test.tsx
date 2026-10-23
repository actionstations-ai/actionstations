// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Job } from '@shared/schemas/job'
import { mockTtx } from '../documents/test-utils'
import { applyProgress, applyToken, emptyLog, seedFromJob } from './live-log'
import { LiveLogPanel } from './LiveLogPanel'
import { useLiveLog } from './use-live-log'

const PROJECT = '/Users/test/NCIA.ttxproj'
const job = (over: Partial<Job> = {}): Job => ({
  id: 'JOB1',
  kind: 'generate-scenario',
  status: 'running',
  projectPath: PROJECT,
  scenarioId: 'S1',
  progress: 0.3,
  message: 'Writing MSEL phase 2',
  createdAt: '2026-10-21T10:00:00.000Z',
  updatedAt: '2026-10-21T10:01:00.000Z',
  resumable: true,
  ...over,
})

function Harness(props: { initialJobId?: string }) {
  const { log } = useLiveLog(PROJECT, 'S1', props.initialJobId)
  return <LiveLogPanel log={log} />
}

afterEach(() => cleanup())

describe('live-log state', () => {
  it('appends tokens per stage/item and logs changed progress messages', () => {
    let log = emptyLog('J')
    log = applyToken(log, { jobId: 'J', stage: 'msel_phase', itemId: 'p1', text: '{"rows":' })
    log = applyToken(log, { jobId: 'J', stage: 'msel_phase', itemId: 'p1', text: '[]}' })
    log = applyToken(log, { jobId: 'OTHER', stage: 'msel_phase', text: 'ignored' })
    const p = { jobId: 'J', kind: 'generate-scenario', status: 'running', progress: 0.5 } as const
    log = applyProgress(log, { ...p, message: 'Phase 1' })
    log = applyProgress(log, { ...p, message: 'Phase 1' })
    log = applyProgress(log, { ...p, message: 'Phase 2', stage: 'msel_phase' })
    expect(log.streams).toEqual([
      { key: 'msel_phase:p1', stage: 'msel_phase', itemId: 'p1', text: '{"rows":[]}' },
    ])
    expect(log.entries.map((e) => e.message)).toEqual(['Phase 1', 'Phase 2'])
    expect(log.progress).toBe(0.5)
  })

  it('seeds from a recorded job log, splitting stage:item keys', () => {
    const log = seedFromJob(job(), {
      entries: [{ at: '2026-10-21T10:00:00.000Z', level: 'info', message: 'Started' }],
      tokens: { scenario_overview: 'abc', 'msel_phase:p2': 'def' },
    })
    expect(log.streams.map((s) => [s.stage, s.itemId])).toEqual([
      ['scenario_overview', undefined],
      ['msel_phase', 'p2'],
    ])
  })
})

describe('LiveLogPanel + useLiveLog', () => {
  it('rehydrates a running job for this scenario after a reload, then streams', async () => {
    const ttx = mockTtx({
      'jobs:list': () => [job({ id: 'OLD', scenarioId: 'S2' }), job()],
      'jobs:get': () => job(),
      'jobs:log': () => ({
        entries: [{ at: '2026-10-21T10:00:00.000Z', level: 'info', message: 'Overview done' }],
        tokens: { 'msel_phase:p2': '| 1:00 | I-05 |' },
      }),
    })
    render(<Harness />)
    expect(await screen.findByText('Overview done')).toBeTruthy()
    expect(screen.getByText('| 1:00 | I-05 |')).toBeTruthy()
    // The global job store (#197) lists active jobs once; this scenario's job is followed.
    expect(ttx.calls('jobs:list')[0]).toEqual({ activeOnly: true })
    expect(ttx.calls('jobs:log')[0]).toEqual({ jobId: 'JOB1' })

    act(() =>
      ttx.emit('job:token', {
        jobId: 'JOB1',
        stage: 'msel_phase',
        itemId: 'p2',
        text: ' Facilitator |',
      }),
    )
    act(() =>
      ttx.emit('job:token', { jobId: 'OLD', stage: 'msel_phase', itemId: 'p2', text: 'nope' }),
    )
    expect(screen.getByText('| 1:00 | I-05 | Facilitator |')).toBeTruthy()
    act(() =>
      ttx.emit('job:progress', {
        jobId: 'JOB1',
        kind: 'generate-scenario',
        status: 'running',
        progress: 0.6,
        message: 'Writing MSEL phase 3',
      }),
    )
    const bar = screen.getByRole('progressbar', { name: 'Generation progress' })
    expect(bar.getAttribute('aria-valuenow')).toBe('60')
    act(() => ttx.emit('job:done', { jobId: 'JOB1', kind: 'generate-scenario', status: 'done' }))
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull())
    expect(screen.getByText('done')).toBeTruthy()
  })

  it('follows the job the generate screen just started', async () => {
    const ttx = mockTtx({
      'jobs:get': () => job({ id: 'NEW', message: 'Queued', status: 'queued', progress: 0 }),
      'jobs:log': () => ({ entries: [], tokens: {} }),
    })
    render(<Harness initialJobId="NEW" />)
    await waitFor(() => expect(ttx.calls('jobs:log')).toEqual([{ jobId: 'NEW' }]))
    act(() => ttx.emit('job:token', { jobId: 'NEW', stage: 'scenario_overview', text: '{"theme"' }))
    expect(await screen.findByText('{"theme"')).toBeTruthy()
  })

  it('says nothing is running when there is no job', async () => {
    mockTtx({ 'jobs:list': () => [] })
    render(<Harness />)
    expect(await screen.findByText(/No generation is running/)).toBeTruthy()
  })
})
