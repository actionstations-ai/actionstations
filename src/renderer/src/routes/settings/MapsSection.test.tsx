// @vitest-environment happy-dom
// Settings › Maps (#436, FR-10): online maps are off by default and the switch says what the
// provider receives; choosing a provider and turning the switch on go through maps:settings-set;
// stored map files are listed with Delete; the area dialog shows its estimate and the limits.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import { MapsSettings, type AppSettings, type StoredArchive } from '@shared/schemas'
import { queryClient } from '../../lib/query'
import { mockTtx } from '../documents/test-utils'
import { MapsSection, ONLINE_MAPS_NOTICE } from './MapsSection'

const AXE = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } }
const settingsWith = (maps: Parameters<typeof MapsSettings.parse>[0] = {}) =>
  ({ maps: MapsSettings.parse(maps) }) as unknown as AppSettings

const ohio = {
  sha256: 'a'.repeat(64),
  kind: 'catalog',
  format: 'pmtiles',
  title: 'Ohio',
  bytes: 1.1 * 1024 ** 3,
  bounds: [-85, 38, -80, 42],
  minZoom: 0,
  maxZoom: 15,
  tileType: 'vector',
  schema: 'protomaps',
  attribution: '© OpenStreetMap contributors',
  catalogId: 'us-oh',
  builtAt: '2026.10',
  addedAt: '2026-10-01T00:00:00.000Z',
  usedBy: ['Rivergate', 'County series', 'Example'],
} satisfies StoredArchive & { usedBy: string[] }

function renderSection(maps = {}, extra: Parameters<typeof mockTtx>[0] = {}) {
  queryClient.clear()
  const ttx = mockTtx({
    'maps:store': () => [ohio],
    'maps:settings-set': () => MapsSettings.parse(maps),
    'settings:get': () => settingsWith(maps),
    ...extra,
  })
  render(
    <QueryClientProvider client={queryClient}>
      <MapsSection settings={settingsWith(maps)} />
    </QueryClientProvider>,
  )
  return ttx
}

afterEach(() => cleanup())

describe('Settings › Maps', () => {
  it('is off by default and says what the provider receives', () => {
    renderSection()
    const box = screen.getByRole('checkbox', { name: 'Use online maps' }) as HTMLInputElement
    expect(box.checked).toBe(false)
    expect(ONLINE_MAPS_NOTICE).toBe(
      "When on, the map provider receives your computer's IP address and the map tiles for the area you view. Nothing else from your project is sent.",
    )
    expect(screen.getByText(ONLINE_MAPS_NOTICE)).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Provider' })).toBeNull()
  })

  it('turns online maps on through maps:settings-set', async () => {
    const ttx = renderSection()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use online maps' }))
    await waitFor(() =>
      expect(ttx.calls('maps:settings-set')).toEqual([{ online: { enabled: true } }]),
    )
  })

  it('offers OpenFreeMap, OpenStreetMap and a custom address, with attribution required for custom', async () => {
    const ttx = renderSection({ online: { enabled: true, provider: 'custom' } })
    expect(screen.getByRole('radio', { name: /OpenFreeMap/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /OpenStreetMap standard/ })).toBeTruthy()
    expect(
      (screen.getByRole('radio', { name: /Custom address/ }) as HTMLInputElement).checked,
    ).toBe(true)
    expect(screen.getByText(/Required\. It is shown on every map/)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /OpenStreetMap standard/ }))
    await waitFor(() =>
      expect(ttx.calls('maps:settings-set')).toEqual([{ online: { provider: 'osm' } }]),
    )
  })

  it('lists stored map files with size, release, use, and a confirmed Delete', async () => {
    const ttx = renderSection()
    expect(await screen.findByText('Ohio')).toBeTruthy()
    expect(screen.getByText(/1\.1 GB, release 2026\.10, used by 3 projects/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Ohio' }))
    expect(ttx.calls('maps:store-delete')).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Delete Ohio' }))
    await waitFor(() => expect(ttx.calls('maps:store-delete')).toEqual([{ sha256: ohio.sha256 }]))
  })

  it('fetches the catalog only after the user asks for the list', async () => {
    const ttx = renderSection(
      {},
      {
        'maps:catalog': () => ({
          release: '2026.10',
          attribution: '© OpenStreetMap contributors',
          cached: false,
          entries: [
            {
              entry: {
                id: 'us-dc',
                name: 'District of Columbia',
                kind: 'district',
                bbox: [-77.2, 38.7, -76.9, 39],
                minZoom: 0,
                maxZoom: 15,
                parts: [
                  { url: 'https://github.com/x', bytes: 40 * 1024 ** 2, sha256: 'b'.repeat(64) },
                ],
              },
              installed: false,
              updateAvailable: false,
              bytes: 40 * 1024 ** 2,
            },
          ],
        }),
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Download a state map…' }))
    expect(await screen.findByText(/Opening the list contacts GitHub/)).toBeTruthy()
    expect(ttx.calls('maps:catalog')).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Show the list' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Download District of Columbia' }))
    await waitFor(() => expect(ttx.calls('maps:download-state')).toEqual([{ ids: ['us-dc'] }]))
  })

  it('shows the tile estimate and refuses a plan over the OpenFreeMap limit', async () => {
    renderSection(
      {},
      {
        'maps:area-plan': (req: { maxZoom: number }) =>
          req.maxZoom > 12
            ? {
                tiles: 9000,
                estimatedBytes: 108e6,
                allowed: false,
                reason: "9,000 tiles is over OpenFreeMap's limit of 3,000 for offline use.",
                suggestedMaxZoom: 12,
              }
            : { tiles: 1840, estimatedBytes: 22 * 1024 ** 2, allowed: true },
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Download an area…' }))
    const box: [string, string][] = [
      ['West', '-83.0'],
      ['South', '39.9'],
      ['East', '-82.9'],
      ['North', '40.0'],
    ]
    for (const [label, value] of box)
      fireEvent.change(await screen.findByLabelText(label), { target: { value } })
    expect(
      await screen.findByText(
        /1,840 tiles, about 22 MB, within OpenFreeMap's 3,000-tile \/ 50 MB offline limit/,
      ),
    ).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Download' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
    fireEvent.change(screen.getByLabelText('Highest zoom (14 at most)'), {
      target: { value: '14' },
    })
    expect(
      await screen.findByText(/over OpenFreeMap's limit.*Try a highest zoom of 12/),
    ).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Download' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('has no axe violations', async () => {
    renderSection({ online: { enabled: true } })
    await screen.findByText('Ohio')
    expect((await axe.run(document.body, AXE)).violations.map((v) => v.id)).toEqual([])
  })
})
