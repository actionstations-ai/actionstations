// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import type { OutboundManifest } from '@shared/schemas'
import { FakeIpcError, mockTtx } from '../routes/documents/test-utils'
import { OutboundApprovalDialog } from './OutboundApprovalDialog'
import { ApprovalHost } from './privacy/ApprovalHost'
import { useApprovals } from './privacy/approvals-store'
import { manifest } from './privacy/test-fixtures'

afterEach(() => {
  cleanup()
  useApprovals.setState({ pending: [], openId: null })
})

function Where() {
  const loc = useLocation()
  return <p data-testid="where">{loc.pathname + loc.hash}</p>
}

function renderDialog(m: OutboundManifest, handlers: Parameters<typeof mockTtx>[0] = {}) {
  const ttx = mockTtx({
    'privacy:decide': () => undefined,
    'privacy:pending': () => [m],
    ...handlers,
  })
  let open = true
  const onOpenChange = (o: boolean) => {
    open = o
  }
  render(
    <MemoryRouter>
      <OutboundApprovalDialog manifest={m} open onOpenChange={onOpenChange} />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
  return { ttx, isOpen: () => open }
}

describe('OutboundApprovalDialog (#433)', () => {
  it('names the host and model and groups excerpts by document, collapsed', () => {
    renderDialog(manifest())
    const dialog = screen.getByRole('dialog', { name: 'Send to Anthropic (api.anthropic.com)?' })
    expect(dialog.textContent).toContain('leaves your computer and goes to api.anthropic.com')
    expect(dialog.textContent).toContain('model claude-test')
    expect(
      within(dialog).getByRole('heading', { name: 'Plan excerpts (3 from 2 documents)' }),
    ).toBeTruthy()
    const groups = dialog.querySelectorAll('details.outbound-group')
    expect([...groups].map((g) => g.querySelector('summary strong')?.textContent)).toEqual([
      'Emergency Operations Plan',
      'Water System Plan',
      'Instructions',
    ])
    expect(groups[0]!.textContent).toContain('2 excerpts')
    expect([...groups].every((g) => !(g as HTMLDetailsElement).open)).toBe(true)
  })

  it('marks each redacted value with text as well as colour', () => {
    renderDialog(manifest())
    const marks = [...document.querySelectorAll('mark.redacted')]
    expect(marks.map((m) => m.textContent)).toEqual([
      '[name] Dana Ruiz sent as [[PERSON_7F3K]]',
      '[phone] (509) 555-0142 sent as [[PHONE_Q2MA]]',
    ])
    expect(screen.getByText(/Pattern-based: review the highlighted text/)).toBeTruthy()
    expect(screen.getByText('Names: 1 replaced with placeholders')).toBeTruthy()
  })

  it('sends the decision with the hash of the request shown, then closes', async () => {
    const { ttx, isOpen } = renderDialog(manifest())
    await userEvent.click(
      screen.getByRole('button', { name: 'Send and approve these documents for this job' }),
    )
    expect(ttx.calls('privacy:decide')).toEqual([
      { requestId: 'R1', requestHash: 'hash-abc', decision: 'approve-documents' },
    ])
    await waitFor(() => expect(isOpen()).toBe(false))
  })

  it('cancels the job', async () => {
    const { ttx } = renderDialog(manifest())
    await userEvent.click(screen.getByRole('button', { name: 'Cancel job' }))
    expect(ttx.calls('privacy:decide')).toEqual([
      { requestId: 'R1', requestHash: 'hash-abc', decision: 'cancel' },
    ])
  })

  it('re-reads pending requests when the request changed before the answer', async () => {
    const { ttx, isOpen } = renderDialog(manifest(), {
      'privacy:decide': () => {
        throw new FakeIpcError('CONFLICT', 'changed')
      },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(ttx.calls('privacy:pending')).toHaveLength(1))
    expect(isOpen()).toBe(true)
  })

  it('Change redaction opens the project privacy page', async () => {
    renderDialog(manifest())
    await userEvent.click(screen.getByRole('button', { name: 'Change redaction' }))
    expect(screen.getByTestId('where').textContent).toBe('/p/%2Fp/privacy')
  })

  it('says embeddings are not redacted and offers no document approval without excerpts', () => {
    renderDialog(manifest({ kind: 'embed', redactable: false, excerpts: [], spans: [] }))
    expect(screen.getByRole('note').textContent).toMatch(/Redaction does not apply to embedding/)
    expect(screen.queryByRole('button', { name: /approve these documents/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Change redaction' })).toBeNull()
  })

  it('keeps keyboard focus inside the dialog', async () => {
    renderDialog(manifest())
    const dialog = screen.getByRole('dialog')
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    for (let i = 0; i < 12; i++) {
      await userEvent.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })
})

describe('ApprovalHost (#433)', () => {
  it('shows a notice when a request waits and opens the dialog from Review', async () => {
    const m = manifest()
    let pending: OutboundManifest[] = []
    const ttx = mockTtx({ 'privacy:pending': () => pending })
    render(
      <MemoryRouter>
        <ApprovalHost />
      </MemoryRouter>,
    )
    await waitFor(() => expect(ttx.calls('privacy:pending')).toHaveLength(1))
    expect(screen.queryByRole('status')).toBeNull()
    pending = [m]
    act(() =>
      ttx.emit('outbound:approval-needed', {
        requestId: 'R1',
        jobId: 'J1',
        providerLabel: 'Anthropic',
        host: 'api.anthropic.com',
      }),
    )
    const notice = await screen.findByText(
      'A request is waiting for your approval before it goes to api.anthropic.com.',
    )
    expect(notice.getAttribute('role')).toBe('status')
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByRole('dialog', { name: /Send to Anthropic/ })).toBeTruthy()

    pending = []
    act(() => ttx.emit('outbound:approval-settled', { requestId: 'R1' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
