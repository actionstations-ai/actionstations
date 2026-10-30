// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebCryptoProvider } from '../../../shared/live/crypto/webcrypto'
import type { MapStatePayload } from '../../../shared/live/schemas'
import { MemoryKeyValue } from '../../../shared/live/transport'
import { DEFAULT_PREFS } from '../../app/prefs'
import { PlayerSession } from '../../app/session'
import { MapScreen, placePins } from './MapScreen'

const plan: MapStatePayload = {
  mapId: 'hangar-1',
  title: 'Hangar 1',
  mapKind: 'site_plan',
  alt: 'Site plan Hangar 1 with 2 places',
  pins: [
    { label: 'Gate A1', detail: 'T-1, T-4', kind: 'incident', x: 40, y: 55 },
    { label: 'Command post', kind: 'command', x: 70, y: 20 },
  ],
  targets: ['role:ops'],
}

const geo: MapStatePayload = {
  mapId: 'harbor',
  title: 'Harbor',
  mapKind: 'geo',
  pins: [
    { label: 'Pier 4', kind: 'incident', lat: 47.6, lon: -122.34 },
    { label: 'Staging lot', kind: 'staging', lat: 47.58, lon: -122.3 },
  ],
  targets: ['role:ops'],
}

function setup(map?: MapStatePayload) {
  const session = new PlayerSession({
    url: 'http://127.0.0.1/s/session-00000000000000#x',
    crypto: createWebCryptoProvider(),
    storage: new MemoryKeyValue(),
    connect: () => {
      throw new Error('not in this test')
    },
    announcer: { announce: () => {} },
    prefs: () => DEFAULT_PREFS,
    bundleVersion: 'test',
  })
  session.store.set({ phase: 'seated', connection: 'connected', map })
  const onBack = vi.fn()
  const view = render(<MapScreen session={session} onBack={onBack} />)
  return { session, onBack, view }
}

afterEach(() => cleanup())

describe('placePins', () => {
  it('numbers places from 1 and keeps site plan positions', () => {
    expect(placePins(plan).map((p) => [p.n, p.x, p.y])).toEqual([
      [1, 40, 55],
      [2, 70, 20],
    ])
  })

  it('places geographic pins on the schematic, north above south', () => {
    const [north, south] = placePins(geo)
    expect(north!.y).toBeLessThan(south!.y)
  })
})

describe('MapScreen', () => {
  it('says so when no map is shared', () => {
    setup()
    expect(screen.getByText('No map is being shared right now.')).toBeTruthy()
  })

  it('lists every place with the messages that mention it', () => {
    setup(plan)
    expect(screen.getByRole('heading', { level: 1, name: 'Hangar 1' })).toBeTruthy()
    const items = screen.getAllByRole('listitem')
    expect(items.map((i) => i.textContent)).toEqual(['Gate A1 Messages: T-1, T-4', 'Command post'])
    expect(screen.getByRole('img', { name: 'Site plan Hangar 1 with 2 places' })).toBeTruthy()
  })

  it('shows coordinates and a note for a geographic map', () => {
    setup(geo)
    expect(screen.getByText(/Positions only/)).toBeTruthy()
    expect(screen.getByText(/47\.6000° N, 122\.3400° W/)).toBeTruthy()
  })

  it('says so when the controller has not delivered anything to this seat yet', () => {
    setup({ ...plan, pins: [] })
    expect(screen.getByText(/No places to show yet/)).toBeTruthy()
  })

  it('goes back', () => {
    const { onBack } = setup(plan)
    screen.getByRole('button', { name: /Back/ }).click()
    expect(onBack).toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    const { view } = setup(plan)
    const result = await axe.run(view.container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(result.violations).toEqual([])
  })
})
