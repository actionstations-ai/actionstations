import { describe, expect, it } from 'vitest'
import { Place, ProjectMaps } from '../schemas/maps'
import { locationRows, matchPlaces, pinsFor, type PinRow } from './pins'

const place = (id: string, label: string, extra: Partial<Place> = {}): Place =>
  Place.parse({ id, label, positions: [{ mapId: 'plan1', x: 10, y: 20 }], ...extra })

const places = [
  place('gate', 'Gate A1', { factRef: 'gates:A1' }),
  place('eoc', 'EOC', { kind: 'command' }),
]
const rows: PinRow[] = [
  { id: 'I-01', time: '0:00', placeIds: ['gate'], toRoleIds: ['ops'] },
  { id: 'I-02', time: '0:15', placeIds: ['gate', 'eoc'], toRoleIds: ['pio'] },
  { id: 'I-03', time: '1:00', placeIds: ['eoc'] },
]
const base = { rows, places, mapId: 'plan1', delivered: { 'I-01': {} }, elapsedMin: 20 }

describe('pinsFor', () => {
  it('shows delivered and due rows to the facilitator, and hides upcoming ones by default', () => {
    const pins = pinsFor({ ...base, audience: 'facilitator' })
    const gate = pins.find((p) => p.placeId === 'gate')!
    expect(gate.rows).toEqual([
      { rowId: 'I-01', status: 'delivered' },
      { rowId: 'I-02', status: 'due' },
    ])
    expect(gate.status).toBe('due')
    expect(pins.find((p) => p.placeId === 'eoc')!.rows.map((r) => r.rowId)).toEqual(['I-02'])
  })

  it('adds upcoming rows only when asked', () => {
    const pins = pinsFor({ ...base, audience: 'facilitator', showUpcoming: true })
    expect(pins.find((p) => p.placeId === 'eoc')!.rows.map((r) => r.status)).toEqual([
      'due',
      'upcoming',
    ])
  })

  it.each(['room', 'device'] as const)(
    'never includes due or upcoming rows for the %s',
    (audience) => {
      const pins = pinsFor({ ...base, audience, showUpcoming: true })
      expect(pins.flatMap((p) => p.rows)).toEqual([{ rowId: 'I-01', status: 'delivered' }])
    },
  )

  it('limits a device to its own role and skips places not on this map', () => {
    const delivered = { 'I-01': {}, 'I-02': {} }
    const pins = pinsFor({ ...base, delivered, audience: 'device', roleId: 'pio' })
    expect(pins.flatMap((p) => p.rows.map((r) => r.rowId))).toEqual(['I-02', 'I-02'])
    expect(pinsFor({ ...base, delivered, audience: 'device', mapId: 'other' })).toEqual([])
  })

  it('mirrors the pins as a list of row, place and status', () => {
    const list = locationRows(pinsFor({ ...base, audience: 'facilitator' }))
    expect(list).toContainEqual({ rowId: 'I-02', place: 'EOC', status: 'due' })
  })
})

describe('matchPlaces (rule pass, no model)', () => {
  it('matches a label or fact entry at word boundaries, ignoring case', () => {
    expect(matchPlaces('Smoke reported near gate a1 concourse', places)).toEqual(['gate'])
    expect(matchPlaces('The EOC is activated', places)).toEqual(['eoc'])
    expect(matchPlaces('The geocoder fails', places)).toEqual([])
  })
})

describe('ProjectMaps schema', () => {
  it('round-trips and keeps unknown keys from a newer version', () => {
    const parsed = ProjectMaps.parse({ maps: [], places: [place('g', 'G')], future: { a: 1 } })
    expect(ProjectMaps.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed)
    expect((parsed as Record<string, unknown>).future).toEqual({ a: 1 })
  })

  it('accepts percent and geographic positions and rejects out-of-range values', () => {
    const geo = { mapId: 'm', lat: 40, lon: -83 }
    expect(Place.safeParse({ id: 'a', label: 'A', positions: [geo] }).success).toBe(true)
    const off = { mapId: 'm', x: 101, y: 5 }
    expect(Place.safeParse({ id: 'a', label: 'A', positions: [off] }).success).toBe(false)
    const pole = { mapId: 'm', lat: 95, lon: 0 }
    expect(Place.safeParse({ id: 'a', label: 'A', positions: [pole] }).success).toBe(false)
  })

  it('limits an area to 32 points', () => {
    const area = Array.from({ length: 33 }, () => ({ x: 1, y: 1 }))
    const pos = { mapId: 'm', x: 1, y: 1, area }
    expect(Place.safeParse({ id: 'a', label: 'A', positions: [pos] }).success).toBe(false)
  })
})
