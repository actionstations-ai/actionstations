// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import type { OutboundManifest } from '@shared/schemas'
import { mockTtx } from '../routes/documents/test-utils'
import { OutboundApprovalDialog } from './OutboundApprovalDialog'
import { manifest } from './privacy/test-fixtures'

afterEach(cleanup)

function renderDialog(m: OutboundManifest) {
  const ttx = mockTtx({ 'privacy:decide': () => undefined, 'privacy:pending': () => [m] })
  render(
    <MemoryRouter>
      <OutboundApprovalDialog manifest={m} open onOpenChange={() => undefined} />
    </MemoryRouter>,
  )
  return ttx
}

describe('OutboundApprovalDialog leave-out and embedding sources (#502)', () => {
  it('leaves chosen sections out and sends their chunk ids', async () => {
    const ttx = renderDialog(manifest())
    expect(screen.queryByRole('button', { name: /Leave out/ })).toBeNull()
    const boxes = screen.getAllByRole('checkbox', { name: /Leave this section out/ })
    expect(boxes).toHaveLength(3)
    await userEvent.click(boxes[1]!)
    await userEvent.click(
      screen.getByRole('button', { name: 'Leave out 1 section and review again' }),
    )
    expect(ttx.calls('privacy:decide')).toEqual([
      { requestId: 'R1', requestHash: 'hash-abc', decision: 'leave-out', leaveOut: [12] },
    ])
  })

  it('offers no leave-out outside a job', () => {
    const m = manifest()
    delete m.jobId
    renderDialog(m)
    expect(screen.queryByRole('checkbox', { name: /Leave this section out/ })).toBeNull()
  })

  it('lists the documents of an embedding request by name, with the text folded away', () => {
    renderDialog(
      manifest({
        kind: 'embed',
        redactable: false,
        excerpts: [],
        spans: [],
        parts: [{ name: 'Text 1', chars: 9, text: 'raw words' }],
        sources: [
          { title: 'Emergency Operations Plan', passages: 12 },
          { title: 'Water System Plan', passages: 1 },
        ],
      }),
    )
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Documents (2 documents)' })).toBeTruthy()
    expect(dialog.textContent).toContain('Emergency Operations Plan')
    expect(dialog.textContent).toContain('12 passages')
    expect(dialog.textContent).toContain('1 passage')
    expect(within(dialog).getByRole('heading', { name: 'Exact text' })).toBeTruthy()
    expect(dialog.querySelector('details.outbound-group')?.hasAttribute('open')).toBe(false)
  })

  it('has no axe violations with the leave-out boxes shown', async () => {
    renderDialog(manifest())
    const result = await axe.run(screen.getByRole('dialog'), {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })
})
