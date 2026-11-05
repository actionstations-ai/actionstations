// The animal disease figure kinds (#857): each draws valid, repeatable, accessible SVG from
// simulation-built data, writes a summary with the key values and a data table, never relies on
// color alone, and refuses data that does not fit. The SVG of each fixture is kept as a file
// snapshot for review.
import { describe, expect, it } from 'vitest'
import { computeZones } from '../../../toolkits/animal_disease/zones'
import { generatePremises } from '../../../toolkits/animal_disease/simulate/premises'
import { runSpread } from '../../../toolkits/animal_disease/simulate/spread'
import { runDepopulation } from '../../../toolkits/animal_disease/simulate/capacity'
import { presumptiveMs } from '../../../toolkits/animal_disease/simulate/spread'
import {
  DEFAULT_METHODS,
  DEFAULT_SITES,
} from '../../../toolkits/animal_disease/simulate/generators'
import {
  curveDataFromSpread,
  depopTrackerData,
  designateOnDay,
  networkDataFromSpread,
  premisesMapData,
  premisesTableData,
} from '../../../toolkits/animal_disease/figure-data'
import { listFigureKinds, renderFigure } from '../index'
import { ANIMAL_FIGURE_KINDS } from './index'
import { floodedPremises, insideRing } from './premises-map'

const premises = generatePremises({ seed: 3 })
const run = runSpread(premises, { index: ['P-001'], seed: 6, baseDailyProb: 0.25, days: 40 })
const day = 12
const infected = run.infections.filter((i) => i.detectedDay <= day)
const placed = premises.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon }))
const zones = computeZones({
  plan: 'hpai',
  infected: placed.filter((p) => infected.some((i) => i.premisesId === p.id)),
  premises: placed,
})
const designated = designateOnDay(premises, run, day, zones)
const start = run.params.startDate
const depop = runDepopulation({
  premises: run.infections.map((i) => {
    const p = premises.find((q) => q.id === i.premisesId)!
    return {
      id: p.id,
      species: p.species,
      head: p.head,
      presumptiveAt: new Date(presumptiveMs(start, i)).toISOString(),
    }
  }),
  crews: 4,
  methods: DEFAULT_METHODS,
  disposalSites: DEFAULT_SITES,
})
const presumptive = new Map(run.infections.map((i) => [i.premisesId, presumptiveMs(start, i)]))
const asOf = Date.parse(start) + (day + 1) * 86_400_000

const first = designated.find((p) => p.designation === 'infected')!
const around = (km: number) => ({ lat: first.lat, lon: first.lon, km })
const block = (lat: number, lon: number, d: number) => [
  { lat: lat - d, lon: lon - d },
  { lat: lat - d, lon: lon + d },
  { lat: lat + d, lon: lon + d },
  { lat: lat + d, lon: lon - d },
]

const FIXTURES: Record<string, unknown> = {
  animal_premises_map: premisesMapData(designated, zones, 'Premises and zones, day 12 (simulated)'),
  animal_premises_table: premisesTableData(designated, 'day 12', 'Designated premises'),
  animal_movement_map: {
    title: 'Movement control',
    routes: [
      {
        name: 'County Road 12',
        status: 'permitted',
        points: [
          { lat: first.lat, lon: first.lon - 0.12 },
          { lat: first.lat + 0.02, lon: first.lon + 0.12 },
        ],
      },
      {
        name: 'Mill Creek Road',
        status: 'closed',
        points: [
          { lat: first.lat - 0.1, lon: first.lon - 0.1 },
          { lat: first.lat + 0.08, lon: first.lon + 0.02 },
          { lat: first.lat + 0.12, lon: first.lon + 0.1 },
        ],
      },
      {
        name: 'State Route 9',
        status: 'permit only',
        points: [
          { lat: first.lat - 0.05, lon: first.lon + 0.14 },
          { lat: first.lat + 0.1, lon: first.lon - 0.14 },
        ],
      },
    ],
    checkpoints: [
      {
        name: 'Checkpoint A, County Road 12',
        lat: first.lat + 0.01,
        lon: first.lon + 0.06,
        staffing: 'staffed',
      },
      {
        name: 'Checkpoint B, State Route 9',
        lat: first.lat + 0.03,
        lon: first.lon - 0.05,
        staffing: 'short staffed',
      },
    ],
    rings: [
      {
        around: first.id,
        kind: 'infected zone',
        center: { lat: first.lat, lon: first.lon },
        radiusKm: 3,
      },
      {
        around: first.id,
        kind: 'control area',
        center: { lat: first.lat, lon: first.lon },
        radiusKm: 10,
      },
    ],
    premises: [
      { id: first.id, lat: first.lat, lon: first.lon, head: first.head, designation: 'infected' },
    ],
  },
  animal_depop_tracker: {
    ...depopTrackerData(depop, premises, presumptive, asOf, 'Depopulation and disposal tracker'),
    sites: [
      { name: 'Disposal Site 1', capacityPerDay: 60000, usedToday: 52000 },
      { name: 'Disposal Site 2', capacityPerDay: 120000, usedToday: 130000 },
    ],
  },
  animal_sampling_schedule: { plan: 'FMD Red Book (October 2020)' },
  animal_inundation_overlay: {
    title: 'Premises and flood zones',
    scenario: 'river crest forecast, simulated',
    premises: designated.slice(0, 30).map((p) => ({
      id: p.id,
      lat: p.lat,
      lon: p.lon,
      species: p.species,
      head: p.head,
      designation: p.designation,
    })),
    zones: [
      { name: 'Floodplain A', level: 'high', ring: block(first.lat, first.lon, 0.05) },
      { name: 'Floodplain B', level: 'low', ring: block(first.lat + 0.1, first.lon - 0.1, 0.04) },
    ],
  },
}

describe('animal figure kinds', () => {
  it('registers every kind the toolkit names, once', () => {
    const ids = ANIMAL_FIGURE_KINDS.map((k) => k.kind)
    expect(ids).toEqual(Object.keys(FIXTURES))
    for (const id of ids) expect(listFigureKinds()).toContain(id)
  })

  it.each(Object.keys(FIXTURES))('%s draws valid, repeatable, accessible output', async (kind) => {
    const spec = { kind, data: FIXTURES[kind] }
    const a = renderFigure(spec)
    expect(a.svg.startsWith('<svg')).toBe(true)
    expect(a.svg).toContain('role="img"')
    expect(a.svg).toMatch(/<title id="[^"]+">/)
    expect(a.svg).not.toMatch(/<image|<script|href=|onload|data:/)
    expect(a.svg.match(/<svg/g)).toHaveLength(1)
    expect(a.summary.length).toBeGreaterThan(40)
    expect(a.table?.rows.length).toBeGreaterThan(0)
    for (const row of a.table!.rows) expect(row).toHaveLength(a.table!.columns.length)
    expect(renderFigure(spec).svg).toBe(a.svg)
    await expect(a.svg).toMatchFileSnapshot(`./__snapshots__/${kind}.svg`)
  })

  it('states premises counts, ring distances and the simulated label in the map summary', () => {
    const r = renderFigure({ kind: 'animal_premises_map', data: FIXTURES.animal_premises_map })
    expect(r.summary).toMatch(/\d+ infected/)
    expect(r.summary).toMatch(/infected zone 3 km, control area 10 km, surveillance zone 20 km/)
    expect(r.summary).toMatch(/simulated and the premises are fictional/)
    expect(r.table!.rows.some((row) => /infected \(IP\)/.test(row[3]!))).toBe(true)
  })

  it('marks designations by abbreviation and shape in the drawing, not color alone', () => {
    const svg = renderFigure({
      kind: 'animal_premises_map',
      data: FIXTURES.animal_premises_map,
    }).svg
    expect(svg).toMatch(/IP P-\d{3}/)
    expect(svg).toContain('<polygon')
    expect(svg).toContain('stroke-dasharray')
  })

  it('lists the closed roads and short staffed checkpoints in the movement summary', () => {
    const r = renderFigure({ kind: 'animal_movement_map', data: FIXTURES.animal_movement_map })
    expect(r.summary).toMatch(/Closed: Mill Creek Road/)
    expect(r.summary).toMatch(/Checkpoint B, State Route 9 \(short staffed\)/)
  })

  it('shows the FMD sampling table with its edition and the state plan caveat', () => {
    const r = renderFigure({
      kind: 'animal_sampling_schedule',
      data: FIXTURES.animal_sampling_schedule,
    })
    expect(r.table!.rows.map((x) => x[1])).toEqual(['5', '10', '10', '21'])
    expect(r.svg).toContain('FMD Red Book (October 2020)')
  })

  it('flags depopulation past the goal and a site over capacity', () => {
    const r = renderFigure({ kind: 'animal_depop_tracker', data: FIXTURES.animal_depop_tracker })
    expect(r.summary).toMatch(/goal 24 hours/)
    expect(
      r.table!.rows.some((x) => /% of capacity/.test(String(x[2])) && /Down/i.test(String(x[1]))),
    ).toBe(true)
  })

  it('finds the premises inside a flood zone', () => {
    const ring = block(first.lat, first.lon, 0.05)
    expect(insideRing({ lat: first.lat, lon: first.lon }, ring)).toBe(true)
    expect(insideRing({ lat: first.lat + 1, lon: first.lon }, ring)).toBe(false)
    const flooded = floodedPremises(FIXTURES.animal_inundation_overlay as never)
    expect(flooded.map((f) => f.premises.id)).toContain(first.id)
    const r = renderFigure({
      kind: 'animal_inundation_overlay',
      data: FIXTURES.animal_inundation_overlay,
    })
    expect(r.summary).toMatch(/premises lie in a flood zone/)
  })

  it('feeds the shared epidemic curve and tracing diagram', () => {
    const curve = renderFigure({ kind: 'epi_curve', data: curveDataFromSpread(run) })
    expect(curve.summary).toMatch(/simulated|Infected premises/i)
    const net = renderFigure({ kind: 'epi_contact_network', data: networkDataFromSpread(run, 40) })
    expect(net.table!.rows.length).toBeGreaterThan(1)
    expect(around(3).km).toBe(3)
  })

  it('rejects data that does not fit a kind', () => {
    expect(() => renderFigure({ kind: 'animal_premises_map', data: { premises: [] } })).toThrow(
      /not valid/,
    )
    expect(() =>
      renderFigure({
        kind: 'animal_premises_map',
        data: { premises: [{ id: 'P-1', lat: 44, lon: -93, designation: 'quarantined' }] },
      }),
    ).toThrow(/not valid/)
    expect(() =>
      renderFigure({
        kind: 'animal_movement_map',
        data: { routes: [{ points: [], status: 'open' }] },
      }),
    ).toThrow(/not valid/)
  })
})
