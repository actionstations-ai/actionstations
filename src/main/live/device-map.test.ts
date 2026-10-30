import { describe, expect, it, vi } from 'vitest'
import type { MapLayer, Place } from '@shared/schemas'
import type { DeliverySeat } from './releases'
import {
  audienceOf,
  DeviceMap,
  deviceMapPayload,
  rowsReaching,
  type DeviceMapSource,
} from './device-map'

const plan: MapLayer = {
  kind: 'site_plan',
  id: 'hangar',
  title: 'Hangar 1',
  source: 'maps/hangar/source.png',
  image: 'maps/hangar/plan.png',
  width: 2000,
  height: 1000,
}

const places: Place[] = [
  {
    id: 'gate',
    label: 'Gate A1',
    kind: 'incident',
    note: '',
    positions: [{ mapId: 'hangar', x: 40, y: 55 }],
  },
  {
    id: 'lot',
    label: 'Staging lot',
    kind: 'staging',
    note: '',
    positions: [{ mapId: 'hangar', x: 10, y: 10 }],
  },
]

const msel = [
  { id: 'T-1', time: '0:05', placeIds: ['gate'] },
  { id: 'T-2', time: '0:20', placeIds: ['lot'] },
]

const release = (rowId: string, targets: string[], withdrawn = false) => ({
  rowId,
  targets,
  withdrawn,
})

const seat = (clientId: string, over: Partial<DeliverySeat> = {}): DeliverySeat => ({
  clientId,
  kind: 'player',
  label: 'seat',
  ...over,
})

const ops = audienceOf(seat('0000000000000000000001', { roleId: 'ops', teamId: 'airport' }))!
const police = audienceOf(seat('0000000000000000000002', { roleId: 'police', teamId: 'city' }))!
const evaluator = audienceOf(
  seat('0000000000000000000003', { kind: 'evaluator', roleId: 'evaluators' }),
)!

describe('rowsReaching', () => {
  it('counts rows sent to everyone, to the role or to its team', () => {
    const releases = [
      release('T-1', ['all']),
      release('T-2', ['role:ops']),
      release('T-3', ['team:airport']),
      release('T-4', ['role:police']),
    ]
    expect([...rowsReaching(releases, ops)].sort()).toEqual(['T-1', 'T-2', 'T-3'])
    expect([...rowsReaching(releases, police)].sort()).toEqual(['T-1', 'T-4'])
  })

  it('leaves out withdrawn releases and device-only releases', () => {
    const releases = [release('T-1', ['all'], true), release('T-2', ['client:0a1b2c3d'])]
    expect(rowsReaching(releases, ops).size).toBe(0)
  })
})

describe('deviceMapPayload', () => {
  it('shows a role only the places of rows released to it', () => {
    const releases = [release('T-1', ['role:ops']), release('T-2', ['role:police'])]
    const input = { layer: plan, places, msel, releases }
    const forOps = deviceMapPayload({ ...input, audience: ops })
    const forPolice = deviceMapPayload({ ...input, audience: police })
    expect(forOps.pins.map((p) => p.label)).toEqual(['Gate A1'])
    expect(forPolice.pins.map((p) => p.label)).toEqual(['Staging lot'])
    expect(forOps.targets).toEqual([ops.to])
  })

  it('never includes a row that has not been released', () => {
    const payload = deviceMapPayload({
      layer: plan,
      places,
      msel,
      releases: [],
      audience: evaluator,
    })
    expect(payload.pins).toEqual([])
  })

  it('gives percent positions for a plan and coordinates for a geographic map', () => {
    const geo: MapLayer = {
      kind: 'geo',
      id: 'harbor',
      title: 'Harbor',
      basemap: { kind: 'online', provider: 'openfreemap' },
      style: 'light',
    }
    const geoPlaces: Place[] = [
      {
        id: 'gate',
        label: 'Pier 4',
        kind: 'incident',
        note: '',
        positions: [{ mapId: 'harbor', lat: 47.6, lon: -122.3 }],
      },
    ]
    const payload = deviceMapPayload({
      layer: geo,
      places: geoPlaces,
      msel,
      releases: [release('T-1', ['all'])],
      audience: ops,
    })
    expect(payload.mapKind).toBe('geo')
    expect(payload.pins[0]).toMatchObject({ lat: 47.6, lon: -122.3, detail: 'T-1' })
    expect(payload.pins[0]).not.toHaveProperty('x')
  })
})

describe('DeviceMap', () => {
  const seats = [
    seat('0000000000000000000001', { roleId: 'ops', teamId: 'airport' }),
    seat('0000000000000000000002', { roleId: 'police', teamId: 'city' }),
    seat('0000000000000000000009', { kind: 'simcell', roleId: 'simcell' }),
  ]

  function setup(releases: ReturnType<typeof release>[]) {
    const source: DeviceMapSource = { layers: [plan], places, msel }
    const send = vi.fn(async (_to: string, _payload: unknown) => undefined)
    const state = { releases, seats }
    const map = new DeviceMap({
      source: async () => source,
      releases: async () => state.releases as never,
      seats: () => state.seats,
      image: async () => undefined,
      send,
    })
    const sent = () =>
      Object.fromEntries(send.mock.calls.map((c) => [c[0], c[1]])) as Record<
        string,
        { pins: unknown[]; closed?: boolean }
      >
    return { map, send, state, sent }
  }

  it('sends each device its own state, and nothing to a SimCell helper', async () => {
    const { map, sent } = setup([release('T-1', ['role:ops'])])
    await map.share('hangar')
    expect(Object.keys(sent())).toEqual([
      'client:0000000000000000000001',
      'client:0000000000000000000002',
    ])
    expect(sent()['client:0000000000000000000001']!.pins).toHaveLength(1)
    expect(sent()['client:0000000000000000000002']!.pins).toHaveLength(0)
    expect(map.mapId).toBe('hangar')
  })

  it('resends only to the devices whose places changed', async () => {
    const { map, send, state } = setup([release('T-1', ['role:ops'])])
    await map.share('hangar')
    send.mockClear()
    state.releases = [release('T-1', ['role:ops']), release('T-2', ['role:police'])]
    await map.refresh()
    expect(send.mock.calls.map((c) => c[0])).toEqual(['client:0000000000000000000002'])
  })

  it('sends a device that joins later its first state', async () => {
    const { map, send, state } = setup([release('T-1', ['all'])])
    await map.share('hangar')
    send.mockClear()
    state.seats = [...seats, seat('0000000000000000000004', { roleId: 'ops', teamId: 'airport' })]
    await map.refresh()
    expect(send.mock.calls.map((c) => c[0])).toEqual(['client:0000000000000000000004'])
  })

  it('tells devices the map is gone when sharing stops', async () => {
    const { map, send } = setup([release('T-1', ['all'])])
    await map.share('hangar')
    send.mockClear()
    await map.share(undefined)
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls.every((c) => (c[1] as { closed?: boolean }).closed === true)).toBe(true)
    expect(map.mapId).toBeUndefined()
  })

  it('runs overlapping refreshes in order, so a withdrawn place is not sent again', async () => {
    const { map, send, state, sent } = setup([release('T-1', ['role:ops'])])
    await map.share('hangar')
    send.mockClear()
    let unblock = () => {}
    const gate = new Promise<void>((r) => (unblock = r))
    send.mockImplementationOnce(async () => gate)
    // A second release makes the first refresh send, and hold on that send.
    state.releases = [release('T-1', ['role:ops']), release('T-2', ['role:ops'])]
    const first = map.refresh()
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    // T-2 is withdrawn while that refresh is still sending.
    state.releases = [release('T-1', ['role:ops']), release('T-2', ['role:ops'], true)]
    const second = map.refresh()
    unblock()
    await Promise.all([first, second])
    const forOps = send.mock.calls
      .filter((c) => c[0] === 'client:0000000000000000000001')
      .map((c) => (c[1] as { pins: unknown[] }).pins.length)
    expect(forOps).toEqual([2, 1])
    expect(sent()['client:0000000000000000000001']!.pins).toHaveLength(1)
  })

  it('sends nothing after sharing stops, even if a refresh was still reading', async () => {
    const { map, send, state } = setup([release('T-1', ['all'])])
    await map.share('hangar')
    send.mockClear()
    let unblock = () => {}
    const gate = new Promise<void>((r) => (unblock = r))
    const original = state.releases
    // The refresh is waiting on its releases when the facilitator stops sharing.
    ;(map as unknown as { deps: { releases: () => Promise<unknown> } }).deps.releases =
      async () => {
        await gate
        return original
      }
    state.releases = [release('T-1', ['all']), release('T-2', ['all'])]
    const refresh = map.refresh()
    const stop = map.share(undefined)
    unblock()
    await Promise.all([refresh, stop])
    const last = new Map<string, boolean>()
    for (const c of send.mock.calls)
      last.set(c[0] as string, (c[1] as { closed?: boolean }).closed === true)
    expect([...last.values()].every(Boolean)).toBe(true)
    expect(last.size).toBe(2)
  })

  it('refuses a map that no longer exists', async () => {
    const { map } = setup([])
    await expect(map.share('gone')).rejects.toThrow('That map is gone')
  })
})
