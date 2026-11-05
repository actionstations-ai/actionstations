// Spill map figures (spec 0455 FR-5, #762): the trajectory map, the ESI excerpt with resources at
// risk and the booming plan, drawn from the recorded ESI shoreline of Dauphin Island, Alabama and a
// simulated run. Each has a text summary and a data table, names its source, draws the shoreline
// by class with weight and dash (not color alone) and renders the same bytes twice.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { currentVector, simulateSpill, windVector } from '../../../toolkits/spill/simulate'
import { getFigureKind, renderFigure } from '../index'
import { esiRank, esiStyle } from './map-frame'
import { unprotectedSites } from './boom'

type Pos = [number, number]
interface Fc {
  features: {
    geometry: { type: string; coordinates: Pos[] }
    properties: { ESI?: string; Landward_shoretype?: string }
  }[]
}
const fixture = JSON.parse(
  readFileSync(resolve('tests/fixtures/connectors/esi-query.geojson'), 'utf8'),
) as Fc
const shorelines = fixture.features.map((f) => ({
  esi: f.properties.ESI ?? '',
  shoretype: f.properties.Landward_shoretype ?? '',
  points: f.geometry.coordinates,
}))
const first = shorelines[0]!.points[0]!

/** A ring of `radiusM` meters around a point. */
function ring(lon: number, lat: number, radiusM: number): Pos[] {
  const out: Pos[] = []
  for (let i = 0; i < 24; i++) {
    const a = (2 * Math.PI * i) / 24
    out.push([
      lon + (radiusM * Math.sin(a)) / (111_320 * Math.cos((lat * Math.PI) / 180)),
      lat + (radiusM * Math.cos(a)) / 110_540,
    ])
  }
  return out
}

const run = simulateSpill({
  origin: { lat: first[1] + 0.02, lon: first[0] },
  product: 'diesel',
  volume: 4200,
  unit: 'bbl',
  releaseHours: 2,
  hours: 24,
  stepHours: 6,
  wind: windVector(0, 6),
  current: currentVector(180, 0.15),
})
const at = (h: number) => run.steps.find((s) => s.hour === h)!

const trajectory = {
  title: 'Forecast position of the oil',
  origin: { lon: first[0], lat: first[1] + 0.02, label: 'Tank 14' },
  shorelines: shorelines.map((s) => ({ esi: s.esi, points: s.points })),
  outlines: [6, 12, 24].map((h) => ({
    hour: h,
    label: `+${h} h`,
    best: ring(at(h).center.lon, at(h).center.lat, Math.max(at(h).radiusM, 300)),
    uncertainty: ring(at(h).center.lon, at(h).center.lat, at(h).uncertaintyM),
  })),
  places: [{ name: 'Boat ramp', lon: first[0] + 0.004, lat: first[1] + 0.008 }],
  landfalls: [{ name: 'Dauphin Island shore', hour: 14 }],
}

const esi = {
  title: 'Shoreline classes and resources at risk',
  shorelines,
  resources: [
    {
      name: 'Raw water intake',
      kind: 'Water intake',
      lon: first[0] + 0.003,
      lat: first[1] + 0.004,
      note: 'serves 41,000 customers',
    },
    {
      name: 'Heron Bay marsh',
      kind: 'Marsh',
      lon: first[0] - 0.004,
      lat: first[1] - 0.003,
      note: 'nesting colony',
    },
    {
      name: 'Public boat ramp',
      kind: 'Human use',
      lon: first[0] + 0.006,
      lat: first[1] - 0.004,
      note: '',
    },
  ],
}

const boom = {
  title: 'Protective booming strategy',
  shorelines: shorelines.map((s) => ({ esi: s.esi, points: s.points })),
  sites: [
    { name: 'Raw water intake', lon: first[0] + 0.003, lat: first[1] + 0.004 },
    { name: 'Heron Bay marsh', lon: first[0] - 0.004, lat: first[1] - 0.003 },
    { name: 'Oyster lease', lon: first[0] + 0.02, lat: first[1] + 0.02 },
  ],
  booms: [
    {
      name: 'Intake exclusion',
      strategy: 'exclusion',
      state: 'in_place',
      lengthFt: 1200,
      time: '1330',
      points: [
        [first[0] + 0.002, first[1] + 0.0035],
        [first[0] + 0.0045, first[1] + 0.0045],
      ],
    },
    {
      name: 'Marsh deflection',
      strategy: 'deflection',
      state: 'deploying',
      lengthFt: 600,
      time: '1500',
      points: [
        [first[0] - 0.005, first[1] - 0.003],
        [first[0] - 0.003, first[1] - 0.0035],
      ],
    },
    {
      name: 'Slip containment',
      strategy: 'containment',
      state: 'planned',
      lengthFt: 800,
      time: '1700',
      points: [
        [first[0], first[1]],
        [first[0] + 0.001, first[1] - 0.001],
      ],
    },
    {
      name: 'Fuel dock sorbent',
      strategy: 'containment',
      state: 'needs_repair',
      lengthFt: 150,
      time: '',
      points: [
        [first[0] + 0.006, first[1] - 0.004],
        [first[0] + 0.0065, first[1] - 0.0042],
      ],
    },
  ],
}

const KINDS = [
  ['spill_trajectory_map', trajectory],
  ['esi_excerpt', esi],
  ['boom_plan', boom],
] as const

const dump = (name: string, svg: string): void => {
  const dir = process.env.DUMP_FIGURES
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.svg`), svg)
}

describe('registered', () => {
  it('registers the three map kinds', () => {
    for (const [k] of KINDS) expect(getFigureKind(k), k).toBeDefined()
  })
})

describe.each(KINDS)('%s', (kind, data) => {
  const spec = { kind, data }
  const result = renderFigure(spec)
  dump(kind, result.svg)

  it('draws an accessible SVG whose description is the summary', () => {
    expect(result.svg).toMatch(/^<svg [^>]*role="img"/)
    expect(result.svg).toMatch(/<title id="ft-[a-z0-9]+">/)
    expect(result.svg).toContain('<desc id=')
    expect(result.svg).not.toMatch(/<script|onload=|href="http/i)
    expect(result.svg).not.toMatch(/NaN|undefined|Infinity/)
  })

  it('is deterministic and names where its data comes from', () => {
    expect(renderFigure(spec).svg).toBe(result.svg)
    expect(result.summary).toMatch(
      /Simulated for the exercise|Environmental Sensitivity Index|Exercise plan/,
    )
  })

  it('has a data table with one cell per column and a plain summary', () => {
    const t = result.table!
    expect(t.rows.length).toBeGreaterThan(0)
    for (const r of t.rows) expect(r).toHaveLength(t.columns.length)
    expect(result.summary).not.toMatch(/[<>]/)
  })

  it('draws the shoreline by class with weight and dash, and a legend that says so', () => {
    expect(result.svg).toMatch(/stroke-width="(2|3|4|5\.5)"/)
    expect(result.svg).toMatch(/sensitive \(ESI/)
  })
})

describe('ESI classes', () => {
  it('ranks by the number and groups them from least to most sensitive', () => {
    expect(esiRank('10A')).toBe(10)
    expect(esiRank('6B')).toBe(6)
    expect(esiRank('x')).toBe(0)
    expect(esiStyle('1A').group).toBe('low')
    expect(esiStyle('4').group).toBe('moderate')
    expect(esiStyle('7').group).toBe('high')
    expect(esiStyle('10A').group).toBe('very_high')
    expect(esiStyle('10A').width).toBeGreaterThan(esiStyle('1A').width)
    expect(esiStyle('10A').dash).not.toBe(esiStyle('4').dash)
  })
})

describe('spill_trajectory_map', () => {
  const r = renderFigure({ kind: 'spill_trajectory_map', data: trajectory })

  it('says how far and which way the oil has moved at each time, and the landfall', () => {
    expect(r.summary).toMatch(
      /\+6 h \(hour 6\): the center of the oil is [\d.]+ (km|m) toward the south/,
    )
    expect(r.summary).toContain('Dauphin Island shore: first contact at hour 14')
    expect(r.summary).toContain('not a forecast')
  })

  it('has a table row per time and per landfall', () => {
    expect(r.table!.rows.map((x) => x[0])).toEqual([
      '+6 h',
      '+12 h',
      '+24 h',
      'Landfall: Dauphin Island shore',
    ])
  })

  it('draws an uncertainty outline per time, dotted, and an outline style per time', () => {
    expect((r.svg.match(/stroke-dasharray="2 4"/g) ?? []).length).toBe(3)
    expect(r.svg).toContain('stroke-dasharray="10 4"')
  })

  it('refuses an outline of fewer than three points and more than five times', () => {
    const bad = {
      ...trajectory,
      outlines: [
        {
          hour: 1,
          label: 'x',
          best: [
            [0, 0],
            [1, 1],
          ],
        },
      ],
    }
    expect(() => renderFigure({ kind: 'spill_trajectory_map', data: bad })).toThrow(/best/)
    const many = {
      ...trajectory,
      outlines: Array.from({ length: 6 }, () => trajectory.outlines[0]!),
    }
    expect(() => renderFigure({ kind: 'spill_trajectory_map', data: many })).toThrow(/outlines/)
  })
})

describe('esi_excerpt', () => {
  const r = renderFigure({ kind: 'esi_excerpt', data: esi })

  it('lists the classes present, most sensitive first, and the resources by priority', () => {
    expect(r.summary).toMatch(/Shoreline classes present, most sensitive first: /)
    expect(r.summary).toContain(
      'Priority 1: Raw water intake (water intake), serves 41,000 customers.',
    )
    expect(r.summary).toContain('Priority 3: Public boat ramp (human use).')
  })

  it('numbers the resources on the map and in the table', () => {
    expect(r.table!.columns).toEqual(['Priority', 'Resource at risk', 'Kind', 'Location', 'Notes'])
    expect(r.table!.rows[1]).toEqual([
      '2',
      'Heron Bay marsh',
      'Marsh',
      expect.stringMatching(/N, .* W/),
      'nesting colony',
    ])
    expect(r.svg).toContain('>3</text>')
  })

  it('needs at least one shoreline segment', () => {
    expect(() => renderFigure({ kind: 'esi_excerpt', data: { ...esi, shorelines: [] } })).toThrow(
      /shorelines/,
    )
  })
})

describe('boom_plan', () => {
  const r = renderFigure({ kind: 'boom_plan', data: boom })

  it('counts the states and gives each boom its strategy, length and state', () => {
    expect(r.summary).toContain('4 boom segments (2,750 feet in all)')
    expect(r.summary).toContain('1 in place, 1 deploying, 1 planned, 1 need repair.')
    expect(r.summary).toContain('Intake exclusion: exclusion boom, 1,200 feet, in place, 1330.')
  })

  it('names the sites that have no boom near them', () => {
    expect(unprotectedSites(boom as never)).toEqual(['Oyster lease'])
    expect(r.summary).toContain('No boom near: Oyster lease.')
  })

  it('draws strategy by line style and state by symbol, with the state in words in the table', () => {
    expect(r.svg).toContain('stroke-dasharray="12 5"')
    expect(r.svg).toContain('stroke-dasharray="2 5"')
    expect(r.table!.rows.map((x) => x[3])).toEqual([
      'In place',
      'Deploying',
      'Planned',
      'Needs repair',
    ])
  })

  it('says every site has boom when it does', () => {
    const covered = { ...boom, sites: boom.sites.slice(0, 2) }
    expect(renderFigure({ kind: 'boom_plan', data: covered }).summary).toContain(
      'Every site has boom near it.',
    )
  })

  it('refuses an unknown strategy or state', () => {
    const b = { ...boom, booms: [{ ...boom.booms[0]!, strategy: 'wall' }] }
    expect(() => renderFigure({ kind: 'boom_plan', data: b })).toThrow(/strategy/)
    const s = { ...boom, booms: [{ ...boom.booms[0]!, state: 'lost' }] }
    expect(() => renderFigure({ kind: 'boom_plan', data: s })).toThrow(/state/)
  })
})
