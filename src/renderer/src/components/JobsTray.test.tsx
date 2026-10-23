// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import type { Job } from '@shared/schemas/job'
import { mockTtx } from '../routes/documents/test-utils'
import { JobsTray } from './JobsTray'

const job = (over: Partial<Job>): Job => ({
  id: 'E1',
  kind: 'export',
  status: 'running',
  projectPath: '/p',
  scenarioId: 'S1',
  progress: 0.5,
  message: 'Writing the MSEL PDF',
  createdAt: '2026-10-21T10:00:00.000Z',
  updatedAt: '2026-10-21T10:00:00.000Z',
  resumable: false,
  ...over,
})

afterEach(() => cleanup())

function setup(jobs: Job[]) {
  const ttx = mockTtx({
    'jobs:list': () => jobs,
    'jobs:cancel': () => undefined,
  })
  render(
    <MemoryRouter>
      <JobsTray />
    </MemoryRouter>,
  )
  return ttx
}

describe('JobsTray (#197)', () => {
  it('lists running and interrupted jobs with links, Cancel and Dismiss', async () => {
    const ttx = setup([
      job({}),
      job({
        id: 'I1',
        kind: 'ingest',
        scenarioId: undefined,
        createdAt: '2026-10-21T09:00:00.000Z',
      }),
      job({ id: 'P1', kind: 'generate-injects', status: 'paused', message: 'Interrupted' }),
    ])
    const tray = await screen.findByRole('region', { name: /Background jobs \(3\)/ })
    expect(within(tray).getByRole('link', { name: 'Exporting' }).getAttribute('href')).toBe(
      '/p/%2Fp/scenarios/S1/export',
    )
    expect(
      within(tray).getByRole('link', { name: 'Importing documents' }).getAttribute('href'),
    ).toBe('/p/%2Fp/documents')
    await userEvent.click(within(tray).getByRole('button', { name: 'Cancel: Exporting' }))
    expect(ttx.calls('jobs:cancel')).toEqual([{ jobId: 'E1' }])
    await userEvent.click(within(tray).getByRole('button', { name: 'Dismiss: Writing injects' }))
    expect(ttx.calls('jobs:cancel')).toContainEqual({ jobId: 'P1' })

    act(() => ttx.emit('job:done', { jobId: 'E1', kind: 'export', status: 'cancelled' }))
    act(() => ttx.emit('job:done', { jobId: 'P1', kind: 'generate-injects', status: 'cancelled' }))
    act(() => ttx.emit('job:done', { jobId: 'I1', kind: 'ingest', status: 'done' }))
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull())
  })

  it('renders nothing when no job runs', async () => {
    const ttx = setup([])
    await waitFor(() => expect(ttx.calls('jobs:list')).toHaveLength(1))
    expect(screen.queryByRole('region')).toBeNull()
  })
})
