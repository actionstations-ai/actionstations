// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'
import type { CloudSendEntry } from '@shared/schemas'
import { queryClient } from '../../lib/query'
import { mockTtx } from '../documents/test-utils'
import { CloudSends } from './CloudSends'
import { filterSends } from './cloud-sends-model'

const entry = (over: Partial<CloudSendEntry>): CloudSendEntry => ({
  at: '2026-10-27T09:00:00.000Z',
  providerId: 'anth',
  providerLabel: 'Anthropic',
  host: 'api.anthropic.com',
  model: 'claude-test',
  kind: 'chat',
  task: 'draft',
  stage: 'msel',
  excerpts: [
    { documentId: 'D1', headingPath: 'Annex B > Notifications' },
    { documentId: 'D1', headingPath: 'Annex C > Shelters' },
  ],
  chars: { system: 100, messages: 900 },
  redactions: { person: 3, phone: 1 },
  approval: 'asked',
  requestHash: 'h1',
  ...over,
})

function setup(entries: CloudSendEntry[]) {
  mockTtx({ 'privacy:sends': () => entries })
  queryClient.clear()
  render(
    <QueryClientProvider client={queryClient}>
      <CloudSends projectPath="/p" />
    </QueryClientProvider>,
  )
}

afterEach(() => cleanup())

describe('CloudSends (#433)', () => {
  it('shows an empty state when nothing was sent', async () => {
    setup([])
    expect(await screen.findByText('Nothing has been sent to a cloud provider')).toBeTruthy()
  })

  it('lists sends with sections, sizes, redaction counts and approval, and filters them', async () => {
    setup([
      entry({}),
      entry({
        at: '2026-10-28T09:00:00.000Z',
        providerId: 'or',
        providerLabel: 'OpenRouter',
        host: 'openrouter.ai',
        stage: 'overview',
        excerpts: [],
        redactions: {},
        approval: 'policy-off',
        requestHash: 'h2',
      }),
    ])
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain('Annex B > Notifications')
    expect(rows[0]!.textContent).toContain('1,000')
    expect(rows[0]!.textContent).toContain('Names: 3, Phone numbers: 1')
    expect(rows[0]!.textContent).toContain('You approved it')
    expect(rows[1]!.textContent).toContain('Sent without asking (review off)')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Provider' }), 'or')
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(screen.getByText('Showing 1 of 2')).toBeTruthy()
  })

  it('filters by stage and start date', () => {
    const list = [entry({}), entry({ stage: 'overview', at: '2026-10-29T01:00:00.000Z' })]
    expect(filterSends(list, { provider: '', stage: 'overview', from: '' })).toHaveLength(1)
    expect(filterSends(list, { provider: '', stage: '', from: '2026-10-28' })).toHaveLength(1)
  })
})
