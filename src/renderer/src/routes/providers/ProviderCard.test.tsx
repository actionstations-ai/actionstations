// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProviderView } from '@shared/schemas'
import { queryClient } from '../../lib/query'
import { mockTtx } from '../documents/test-utils'
import { ProviderCard } from './ProviderCard'

const base: ProviderView = {
  id: 'p1',
  kind: 'openai-compatible',
  label: 'Shop server',
  baseUrl: 'http://192.168.1.20:1234/v1',
  options: {},
  enabled: true,
  hasKey: false,
}

function setup(provider: ProviderView) {
  mockTtx({ 'providers:health': () => ({ ok: true, latencyMs: 3 }) })
  queryClient.clear()
  render(
    <QueryClientProvider client={queryClient}>
      <ProviderCard provider={provider} onEdit={() => undefined} />
    </QueryClientProvider>,
  )
  return screen.getByRole('article', { name: provider.label })
}

afterEach(() => cleanup())

describe('ProviderCard cloud marker (#433)', () => {
  it('marks Anthropic as a cloud provider with its host', () => {
    const card = setup({ ...base, kind: 'anthropic', label: 'Anthropic', baseUrl: undefined })
    expect(within(card).getByText('Cloud: sends excerpts to api.anthropic.com')).toBeTruthy()
  })

  it('marks a LAN host as cloud by default and as local when the user says so', () => {
    const card = setup(base)
    expect(within(card).getByText('Cloud: sends excerpts to 192.168.1.20')).toBeTruthy()
    cleanup()
    const local = setup({ ...base, options: { network: 'local', localHost: '192.168.1.20' } })
    expect(within(local).getByText('On your network, treated as local')).toBeTruthy()
  })

  it('shows no marker for a provider on this computer', () => {
    const card = setup({ ...base, baseUrl: 'http://127.0.0.1:1234/v1' })
    expect(within(card).queryByText(/Cloud:/)).toBeNull()
    expect(screen.queryByText('Where')).toBeNull()
  })
})
