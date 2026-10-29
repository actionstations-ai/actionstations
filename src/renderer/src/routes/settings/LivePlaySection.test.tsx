// @vitest-environment happy-dom
// Settings > Live play (spec 0410 FR-10): the default connection, remembered servers with their
// key shown only as stored or not set, rename, re-test and forget.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppSettings } from '@shared/schemas'
import { queryClient } from '../../lib/query'
import { mockTtx } from '../documents/test-utils'
import { LivePlaySection } from './LivePlaySection'

const SETTINGS = { live: { defaultConnectionKind: 'lan', servers: [] } } as unknown as AppSettings
const SERVERS = [
  {
    url: 'https://live.example.org',
    name: 'County EOC',
    addedAt: '2026-10-01T00:00:00.000Z',
    hasKey: true,
  },
  { url: 'https://other.example.org', addedAt: '2026-10-01T00:00:00.000Z', hasKey: false },
]

function renderSection(extra: Parameters<typeof mockTtx>[0] = {}) {
  queryClient.clear()
  const ttx = mockTtx({
    'live:servers-list': () => SERVERS,
    'settings:update': () => SETTINGS,
    ...extra,
  })
  render(
    <QueryClientProvider client={queryClient}>
      <LivePlaySection settings={SETTINGS} />
    </QueryClientProvider>,
  )
  return ttx
}

afterEach(() => cleanup())

describe('Live play settings', () => {
  it('saves the default connection kind', async () => {
    const ttx = renderSection()
    fireEvent.change(await screen.findByLabelText('Default connection'), {
      target: { value: 'relay' },
    })
    await waitFor(() =>
      expect(ttx.calls('settings:update')).toEqual([{ live: { defaultConnectionKind: 'relay' } }]),
    )
  })

  it('lists servers with the key as stored or not set, never its value', async () => {
    renderSection()
    await screen.findByText('https://live.example.org')
    expect(screen.getByText(/Server key: stored/)).toBeTruthy()
    expect(screen.getByText(/Server key: not set/)).toBeTruthy()
  })

  it('forgets a server', async () => {
    const ttx = renderSection({ 'live:server-forget': () => undefined })
    fireEvent.click(await screen.findByRole('button', { name: 'Forget County EOC' }))
    await waitFor(() =>
      expect(ttx.calls('live:server-forget')).toEqual([{ url: 'https://live.example.org' }]),
    )
  })

  it('tests a server again and announces the checklist', async () => {
    const ttx = renderSection({
      'live:connection-test': () => ({
        ok: false,
        checks: [{ id: 'reachable', label: 'The server answered', status: 'fail', detail: 'No.' }],
      }),
    })
    fireEvent.click((await screen.findAllByRole('button', { name: 'Test' }))[0]!)
    await screen.findByText(/Failed: The server answered/)
    expect(ttx.calls('live:connection-test')[0]).toMatchObject({
      connection: { kind: 'self-hosted', url: 'https://live.example.org' },
    })
  })
})
