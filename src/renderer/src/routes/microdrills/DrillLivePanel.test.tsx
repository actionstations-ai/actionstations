// @vitest-environment happy-dom
// Micro-drills on devices (#437 FR-17): the panel says when no live session runs, offers "Send to
// devices" only while one does, shows each participant's progress by label, and closes a drill.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import { mockTtx, renderAt } from '../documents/test-utils'
import MicroDrillsPage from './MicroDrillsPage'

afterEach(cleanup)

const annex = { documentId: 'eop', documentTitle: 'EOP', headingPath: 'EOP › 6.4' }
const listItem = {
  id: 'd1',
  title: 'Notify the duty manager',
  status: 'ready' as const,
  annex,
  durationMin: 15,
  mode: 'solo' as const,
  lintIssues: 0,
  runs: 0,
}
const view = {
  liveId: 'L'.repeat(22),
  drillId: 'd1',
  title: 'Notify the duty manager',
  status: 'open' as const,
  assessment: 'model' as const,
  targets: ['all'],
  openedAt: 1,
  stepCount: 3,
  participants: [
    { label: 'Participant 1', online: true, answered: 2, hints: 1, runId: 'r1' },
    { label: 'Participant 2', online: false, answered: 0, hints: 0, runId: 'r2' },
  ],
}

const page = () => renderAt('/p/x/micro-drills', '/p/:projectKey/micro-drills', MicroDrillsPage)

describe('DrillLivePanel', () => {
  it('says to start a live session when none runs, and offers no send button', async () => {
    mockTtx({
      'microdrills:list': () => [listItem],
      'microdrills:runs': () => [],
      'microdrills:live-status': () => ({ running: false, drills: [] }),
    })
    page()
    expect(await screen.findByText(/Start a live session in Facilitate/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send to devices' })).toBeNull()
  })

  it('sends a Ready drill to devices while a session runs', async () => {
    const ttx = mockTtx({
      'microdrills:list': () => [listItem],
      'microdrills:runs': () => [],
      'microdrills:live-status': () => ({ running: true, drills: [] }),
      'microdrills:live-open': () => view,
    })
    page()
    fireEvent.click(await screen.findByRole('button', { name: 'Send to devices' }))
    await waitFor(() => expect(ttx.calls('microdrills:live-open')).toHaveLength(1))
    expect(ttx.calls('microdrills:live-open')[0]).toEqual({ projectPath: 'x', drillId: 'd1' })
  })

  it('shows progress by label and closes the drill', async () => {
    const ttx = mockTtx({
      'microdrills:list': () => [listItem],
      'microdrills:runs': () => [],
      'microdrills:live-status': () => ({ running: true, drills: [view] }),
      'microdrills:live-close': () => ({ ...view, status: 'closed' as const }),
    })
    page()
    expect(await screen.findByRole('table', { name: /Progress of each device/ })).toBeTruthy()
    expect(screen.getByText('2 of 3')).toBeTruthy()
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Close the drill and finish every run' }))
    await waitFor(() => expect(ttx.calls('microdrills:live-close')).toHaveLength(1))
    expect(ttx.calls('microdrills:live-close')[0]).toEqual({
      projectPath: 'x',
      liveId: view.liveId,
    })
  })
})
