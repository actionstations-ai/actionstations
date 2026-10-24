// @vitest-environment happy-dom
// The example banner (#169) of a project copied from a pack example: a ProvenanceBadge with the
// pack's state from examples:marker (#269).
import { cleanup, render, screen, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'
import type { ExampleMarkerView } from '@shared/ipc'
import { queryClient } from '../lib/query'
import { mockTtx, PROJECT } from '../routes/documents/test-utils'
import { ExampleBanner } from './ExampleBanner'

afterEach(() => {
  cleanup()
  queryClient.clear()
})

const marker: ExampleMarkerView = {
  slug: 'harbor-junction',
  title: 'Harbor Junction',
  notice: 'A made-up railroad.',
  domainProfile: 'heritage_rail',
  packId: 'ai.actionstations.heritage-rail',
  packVersion: '1.0.0',
  packName: 'Freight Rail Operations',
}

function show(m: ExampleMarkerView | null) {
  mockTtx({ 'examples:marker': () => m })
  render(
    <QueryClientProvider client={queryClient}>
      <ExampleBanner projectPath={PROJECT} />
    </QueryClientProvider>,
  )
}

describe('ExampleBanner', () => {
  it('badges a pack example copy with its pack, "not installed" when the pack is gone', async () => {
    show({ ...marker, packState: { packMissing: true, updateAvailable: false } })
    const banner = await screen.findByTestId('example-banner')
    const badge = within(banner).getByRole('img', { name: /Freight Rail Operations/ })
    expect(badge.getAttribute('aria-label')).toBe(
      'Project copy from pack Freight Rail Operations 1.0.0, pack not installed',
    )
    expect(badge.textContent).toBe('From Freight Rail Operations 1.0.0not installed')
  })

  it('shows "Update available" when the installed pack is newer', async () => {
    show({
      ...marker,
      packState: { packMissing: false, updateAvailable: true, installedVersion: '1.1.0' },
    })
    const badge = await screen.findByRole('img', { name: /Freight Rail Operations/ })
    expect(badge.textContent).toBe('From Freight Rail Operations 1.0.0Update available')
  })

  it('has no badge for a built-in example', async () => {
    const { packId: _i, packVersion: _v, packName: _n, ...builtin } = marker
    show(builtin)
    await screen.findByTestId('example-banner')
    expect(screen.queryByRole('img')).toBeNull()
  })
})
