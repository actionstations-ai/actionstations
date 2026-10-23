// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { Job } from '@shared/schemas/job'
import { mockTtx } from '../../routes/documents/test-utils'
import { useJob } from '../../routes/generate/use-job'
import { JobBanner } from './JobBanner'
import { useScenarioJob } from './use-scenario-job'

const PROJECT = '/Users/test/Riverbend.ttxproj'
const job = (over: Partial<Job> = {}): Job => ({
  id: 'OLD',
  kind: 'generate-injects',
  status: 'paused',
  projectPath: PROJECT,
  scenarioId: 'S1',
  progress: 0.4,
  message: 'Interrupted by app exit',
  createdAt: '2026-10-21T10:00:00.000Z',
  updatedAt: '2026-10-21T10:00:00.000Z',
  resumable: false,
  ...over,
})

function Deck() {
  const { job, interrupted } = useScenarioJob(PROJECT, 'S1')
  return (
    <>
      <button type="button" disabled={!!job}>
        Write all injects
      </button>
      <JobBanner job={job} interrupted={interrupted} />
    </>
  )
}

afterEach(() => cleanup())

describe('useScenarioJob + JobBanner after a restart (#194, #195)', () => {
  it('an interrupted job leaves the deck usable and is dismissed with job:done', async () => {
    const ttx = mockTtx({ 'jobs:list': () => [job()], 'jobs:cancel': () => undefined })
    render(<Deck />)
    const banner = await screen.findByRole('region', { name: 'Generation status' })
    expect(within(banner).getByText(/Interrupted: writing injects/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Write all injects' }).hasAttribute('disabled')).toBe(
      false,
    )
    expect(within(banner).queryByRole('button', { name: /Resume/ })).toBeNull()
    await userEvent.click(within(banner).getByRole('button', { name: /Dismiss/ }))
    expect(ttx.calls('jobs:cancel')).toEqual([{ jobId: 'OLD' }])
    act(() => ttx.emit('job:done', { jobId: 'OLD', kind: 'generate-injects', status: 'cancelled' }))
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull())
  })

  it('Resume continues a resumable job; the new job owns the scenario', async () => {
    const ttx = mockTtx({
      'jobs:list': () => [job({ kind: 'generate-scenario', resumable: true })],
      'jobs:resume': () => ({ jobId: 'NEW' }),
    })
    render(<Deck />)
    const banner = await screen.findByRole('region', { name: 'Generation status' })
    await userEvent.click(within(banner).getByRole('button', { name: /Resume/ }))
    expect(ttx.calls('jobs:resume')).toEqual([{ jobId: 'OLD' }])
    expect(await screen.findByText('Generating the scenario for this scenario')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Write all injects' }).hasAttribute('disabled')).toBe(
      true,
    )
    expect(screen.getByRole('button', { name: /Cancel job/ })).toBeTruthy()
  })

  it('a running job owns the scenario until it finishes', async () => {
    const ttx = mockTtx({ 'jobs:list': () => [job({ status: 'running', message: 'I-03' })] })
    render(<Deck />)
    expect(await screen.findByText('Writing injects for this scenario')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Write all injects' }).hasAttribute('disabled')).toBe(
      true,
    )
    act(() => ttx.emit('job:done', { jobId: 'OLD', kind: 'generate-injects', status: 'done' }))
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull())
  })
})

describe('useJob', () => {
  function Follow(props: { id: string; onDone: (status: string) => void }) {
    const state = useJob(props.id, (e) => props.onDone(e.status))
    return <p>{state?.status}</p>
  }

  it('reports a job that finished before the screen mounted, once', async () => {
    mockTtx({
      'jobs:list': () => [],
      'jobs:get': () => job({ id: 'X', kind: 'export', status: 'done', progress: 1 }),
    })
    const seen: string[] = []
    const { rerender } = render(<Follow id="X" onDone={(s) => seen.push(s)} />)
    expect(await screen.findByText('done')).toBeTruthy()
    rerender(<Follow id="X" onDone={(s) => seen.push(s)} />)
    expect(seen).toEqual(['done'])
  })
})
