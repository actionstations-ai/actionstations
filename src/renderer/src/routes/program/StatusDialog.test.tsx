// @vitest-environment happy-dom
// Verifying a corrective action can use a micro-drill run on a cited plan section as evidence
// (#437 FR-20): the run is offered, fills in the method, result and note, and the saved
// verification names the run. Without a matching run nothing extra is shown.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MicroDrillSummary } from '@shared/schemas'
import { mockTtx, renderAt } from '../documents/test-utils'
import { StatusDialog } from './StatusDialog'

afterEach(cleanup)

const run: MicroDrillSummary = {
  drillId: 'd1',
  runId: 'run-17',
  at: '2026-10-01T10:00:00.000Z',
  planSection: {
    documentId: 'eop',
    documentTitle: 'EOP',
    headingPath: 'EOP › 6 Public Information',
  },
  coreCapabilities: [],
  participants: 3,
  minutes: 14,
  coverage: 0.85,
  hintsUsed: 1,
}
const snapshot = { projectId: 'p1', name: 'NCIA', drills: [run] }
const cited = [
  {
    documentId: 'eop',
    documentTitle: 'EOP',
    headingPath: 'EOP › 6 Public Information › 6.4 Releases',
  },
]

function setup(planSections = cited) {
  const ttx = mockTtx({
    'program:snapshots': () => [snapshot] as never,
    'program:action-status': () => ({}) as never,
  })
  const onClose = vi.fn()
  renderAt('/x', '/x', () => (
    <StatusDialog
      programPath="/prog"
      ids={['a1']}
      current="completed"
      planSections={planSections}
      onClose={onClose}
    />
  ))
  return { ttx, onClose }
}

const chooseVerified = () =>
  fireEvent.change(screen.getByLabelText('New status'), { target: { value: 'verified' } })

describe('StatusDialog drill evidence', () => {
  it('offers a drill run on the cited section and fills in the verification from it', async () => {
    const { ttx } = setup()
    chooseVerified()
    const select = await screen.findByLabelText('Use a short drill as evidence')
    fireEvent.change(select, { target: { value: 'run-17' } })
    expect((screen.getByLabelText('How was it checked?') as HTMLSelectElement).value).toBe('review')
    expect((screen.getByLabelText('Result') as HTMLSelectElement).value).toBe('pass')
    const note = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(note.value).toContain('run-17')
    expect(note.value).toContain('85%')
    fireEvent.click(screen.getByRole('button', { name: 'Save status' }))
    await waitFor(() => expect(ttx.calls('program:action-status')).toHaveLength(1))
    const sent = ttx.calls('program:action-status')[0] as {
      verification: { method: string; projectId: string; note: string }
    }
    expect(sent.verification).toMatchObject({ method: 'review', projectId: 'p1' })
    expect(sent.verification.note).toContain('run-17')
  })

  it('shows no drill choice when no run practised a cited section', async () => {
    setup([{ documentId: 'eop', documentTitle: 'EOP', headingPath: 'EOP › 7 Recovery' }])
    chooseVerified()
    await screen.findByLabelText('How was it checked?')
    expect(screen.queryByLabelText('Use a short drill as evidence')).toBeNull()
  })

  it('has no axe violations with the drill choice shown', async () => {
    setup()
    chooseVerified()
    await screen.findByLabelText('Use a short drill as evidence')
    const dialog = screen.getByRole('dialog')
    const result = await axe.run(dialog, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
    expect(within(dialog).getByText(/Only totals are kept/)).toBeTruthy()
  })
})
