// Spill figure kinds (spec 0455 FR-5, #765): drawn from simulated data, each carries a text
// summary and a data table, says where its numbers come from, never relies on color alone, and
// renders the same bytes twice.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  currentVector,
  plumeFootprint,
  simulateSpill,
  windVector,
} from '../../../toolkits/spill/simulate'
import { getFigureKind, renderFigure } from '../index'

const spill = simulateSpill({
  origin: { lat: 30.3, lon: -88.1 },
  product: 'diesel',
  volume: 4200,
  unit: 'bbl',
  releaseHours: 4,
  hours: 48,
  stepHours: 2,
  wind: windVector(135, 6),
  current: currentVector(300, 0.2),
  recovery: { startHour: 6, perHour: 60 },
})

const weathering = {
  title: 'Oil weathering and mass balance',
  unit: 'bbl',
  product: 'Diesel',
  steps: spill.steps.map((s) => ({
    hour: s.hour,
    recovered: s.recovered,
    remaining: s.remaining,
    dispersed: s.dispersed,
    evaporated: s.evaporated,
  })),
  marks: [
    { hour: 6, label: 'Skimmers start recovery' },
    { hour: 26, label: 'Predicted landfall at the marsh' },
  ],
}

const zones = plumeFootprint({
  releaseGramsPerSecond: 2000,
  windMs: 3,
  windFromDeg: 250,
  stability: 'D',
  molecularWeight: 70.9,
  levels: [
    { label: 'Red', ppm: 20 },
    { label: 'Orange', ppm: 2 },
    { label: 'Yellow', ppm: 0.5 },
  ],
})
const plume = {
  title: 'Chlorine release: threat zones',
  release: 'Chlorine, ground-level release of 2 kg per second',
  windFromDeg: 250,
  windMs: 3,
  zones,
  places: [
    { name: 'Elm Street School', east: 1800, north: 650 },
    { name: 'Terminal gate', east: -300, north: 100 },
    { name: 'Water intake', east: 9000, north: 5000 },
  ],
}

const dump = (name: string, svg: string): void => {
  const dir = process.env.DUMP_FIGURES
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.svg`), svg)
}

describe('registered', () => {
  it('names only kinds the app draws in the spill_plume toolkit', () => {
    const toolkit = JSON.parse(
      readFileSync(join(process.cwd(), 'packs/toolkits/spill_plume.json'), 'utf8'),
    ) as { figureKinds: string[] }
    for (const k of toolkit.figureKinds) expect(getFigureKind(k), k).toBeDefined()
  })

  it('registers both kinds with the generic ones', () => {
    expect(getFigureKind('oil_weathering')).toBeDefined()
    expect(getFigureKind('plume_footprint')).toBeDefined()
  })
})

describe.each([
  ['oil_weathering', weathering],
  ['plume_footprint', plume],
])('%s', (kind, data) => {
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

  it('is deterministic and says it is simulated', () => {
    expect(renderFigure(spec).svg).toBe(result.svg)
    expect(result.svg).toContain('Simulated for the exercise')
    expect(result.summary).toContain('Simulated for the exercise')
  })

  it('offers a data table with one cell per column and a plain summary', () => {
    const t = result.table!
    expect(t.rows.length).toBeGreaterThan(0)
    for (const r of t.rows) expect(r).toHaveLength(t.columns.length)
    expect(result.summary).not.toMatch(/[<>]/)
  })

  it('separates its parts by fill pattern, not by color alone', () => {
    expect(result.svg.match(/<pattern /g)?.length).toBeGreaterThanOrEqual(3)
    expect(result.svg).toContain('fill="url(#')
  })
})

describe('oil_weathering', () => {
  const r = renderFigure({ kind: 'oil_weathering', data: weathering })

  it('summarizes the final balance, which adds up to what was released', () => {
    const last = spill.steps.at(-1)!
    expect(r.summary).toContain(`By hour 48, 4,200 barrels had been released`)
    expect(r.summary).toContain(`${Math.round(last.evaporated).toLocaleString('en-US')} evaporated`)
    expect(r.summary).toContain('Mark 2 at hour 26: Predicted landfall at the marsh')
  })

  it('has a row for every step with the released total in the last column', () => {
    expect(r.table!.rows).toHaveLength(weathering.steps.length)
    expect(r.table!.columns.at(-1)).toBe('Released (barrels)')
    expect(r.table!.rows.at(-1)!.at(-1)).toBe('4,200')
  })

  it('refuses steps out of order and a single step', () => {
    const s = weathering.steps
    expect(() =>
      renderFigure({ kind: 'oil_weathering', data: { ...weathering, steps: [s[1], s[0]] } }),
    ).toThrow(/increasing order/)
    expect(() =>
      renderFigure({ kind: 'oil_weathering', data: { ...weathering, steps: [s[0]] } }),
    ).toThrow(/steps/)
  })

  it('prints an imported source instead of the simulation label when one is given', () => {
    const imp = renderFigure({
      kind: 'oil_weathering',
      data: { ...weathering, source: 'Imported model run, 04 Nov 0600' },
    })
    expect(imp.svg).toContain('Imported model run, 04 Nov 0600')
    expect(imp.svg).not.toContain('Simulated for the exercise')
  })
})

describe('plume_footprint', () => {
  const r = renderFigure({ kind: 'plume_footprint', data: plume })

  it('gives each zone its reach and says which zone each place is in', () => {
    expect(r.summary).toMatch(/Red zone, at least 20 ppm: reaches [\d.,]+ (km|m) downwind/)
    expect(r.summary).toContain('Wind from the west')
    expect(r.summary).toContain('the plume travels toward the east')
    expect(r.summary).toMatch(/Elm Street School is inside the (Orange|Yellow|Red) zone/)
    expect(r.summary).toContain('Water intake is outside every zone')
    expect(r.summary).toContain('not a forecast')
  })

  it('lists zones then places in the table', () => {
    const rows = r.table!.rows
    expect(rows[0]![0]).toBe('Red zone')
    expect(rows.at(-1)).toEqual(['Water intake', 'place', 'outside every zone', ''])
  })

  it('draws a zone a level never reaches as not reached, without an outline', () => {
    const none = renderFigure({
      kind: 'plume_footprint',
      data: {
        ...plume,
        zones: [{ label: 'Red', ppm: 1000, distanceM: 0, widthM: 0, outline: [] }],
        places: [],
      },
    })
    expect(none.summary).toContain('Red zone, at least 1,000 ppm: not reached')
  })

  it('needs at least one zone', () => {
    expect(() => renderFigure({ kind: 'plume_footprint', data: { ...plume, zones: [] } })).toThrow(
      /zones/,
    )
  })
})
