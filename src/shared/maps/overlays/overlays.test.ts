// Map overlays (#652): the schema, building layers from GeoJSON and raster descriptors, time
// filtering, the legend, raster georeferencing, and the style tokens' contrast.
import { describe, expect, it } from 'vitest'
import { OverlayLayer, OVERLAY_TOKENS, ProjectMaps, type RasterLayer } from '../../schemas'
import { RADAR, REPORTS, T0, T1, T2, T3, TRACK, WARNINGS, storm } from './fixtures'
import { buildOverlayLayers } from './geojson'
import { legendEntries } from './legend'
import { placeAreaLayer, placeAreasPercent, overlayLayersFor } from './place-areas'
import {
  cellAt,
  displayGrid,
  latFromMercatorY,
  mercatorY,
  rasterCorners,
  rasterRgba,
  rasterStats,
  rowEdgeLat,
  scaleColor,
  valueAt,
} from './raster'
import { TOKEN_STYLE, contrastRatio } from './style'
import { activeAt, filterAt, formatRange, formatStep, frameAt, timeSteps } from './time'

const radar = (): RasterLayer => buildOverlayLayers({ rasters: [RADAR] }).layers[0] as RasterLayer
const ms = (iso: string): number => Date.parse(iso)

describe('overlay schema', () => {
  it('accepts every layer kind the builder makes', () => {
    const layers = storm()
    expect(layers.map((l) => l.kind).sort()).toEqual(['line', 'point', 'polygon', 'raster'])
    for (const l of layers) expect(OverlayLayer.safeParse(l).success).toBe(true)
  })

  it('rejects a raster whose frame has the wrong number of values', () => {
    const bad = { ...radar(), frames: [{ id: 'x', values: [1, 2, 3] }] }
    const r = OverlayLayer.safeParse(bad)
    expect(r.success).toBe(false)
    expect(JSON.stringify(r.error?.issues)).toContain('expected 12')
  })

  it('rejects colour stops that do not increase and a time that ends before it starts', () => {
    const scale = { ...radar().colorScale, stops: [...radar().colorScale.stops].reverse() }
    expect(OverlayLayer.safeParse({ ...radar(), colorScale: scale }).success).toBe(false)
    const poly = storm().find((l) => l.kind === 'polygon')!
    const feature = {
      ...(poly as { features: object[] }).features[0],
      time: { start: T2, end: T0 },
    }
    expect(OverlayLayer.safeParse({ ...poly, features: [feature] }).success).toBe(false)
  })

  it('rejects a polygon ring with fewer than three points and out-of-range coordinates', () => {
    const base = { kind: 'polygon', id: 'p', title: 'P', legend: { label: 'P' } }
    const f = (rings: unknown) => ({ id: 'a', rings })
    expect(
      OverlayLayer.safeParse({
        ...base,
        features: [
          f([
            [
              [0, 0],
              [1, 1],
            ],
          ]),
        ],
      }).success,
    ).toBe(false)
    expect(
      OverlayLayer.safeParse({
        ...base,
        features: [
          f([
            [
              [0, 0],
              [1, 1],
              [200, 5],
            ],
          ]),
        ],
      }).success,
    ).toBe(false)
  })

  it('saves overlays in the project maps file and keeps older files valid', () => {
    expect(ProjectMaps.parse({}).overlays).toBeUndefined()
    const parsed = ProjectMaps.parse({ overlays: [{ mapId: 'm', layers: storm() }] })
    expect(parsed.overlays?.[0]?.layers).toHaveLength(4)
  })
})

describe('building layers from GeoJSON', () => {
  it('makes a layer per kind of shape and reports features it cannot draw', () => {
    const out = buildOverlayLayers({ datasets: [WARNINGS] })
    expect(out.layers).toHaveLength(1)
    expect(out.layers[0]).toMatchObject({ kind: 'polygon', id: 'warnings' })
    expect(out.skipped).toEqual([{ id: 'warnings#3', reason: 'No drawable geometry' }])
  })

  it('reads label, time and severity from common property names', () => {
    const layer = buildOverlayLayers({ datasets: [WARNINGS] }).layers[0] as Extract<
      OverlayLayer,
      { kind: 'polygon' }
    >
    expect(layer.features[0]).toMatchObject({
      id: 'w1',
      label: 'Tornado Warning',
      style: 'critical',
      time: { start: '2026-06-12T18:00:00.000Z', end: '2026-06-12T20:00:00.000Z' },
    })
    expect(layer.features[1]?.style).toBe('watch')
  })

  it('splits a mixed collection into layers with distinct ids', () => {
    const mixed = {
      id: 'mix',
      title: 'Mixed',
      collection: {
        type: 'FeatureCollection' as const,
        features: [
          { type: 'Feature' as const, geometry: { type: 'Point', coordinates: [-84, 39] } },
          {
            type: 'Feature' as const,
            geometry: {
              type: 'LineString',
              coordinates: [
                [-84, 39],
                [-83, 39],
              ],
            },
          },
        ],
      },
    }
    const out = buildOverlayLayers({ datasets: [mixed] })
    expect(out.layers.map((l) => l.id).sort()).toEqual(['mix-line', 'mix-point'])
  })

  it('applies a style map, draws cones and keeps ids unique across datasets', () => {
    const cone = {
      ...WARNINGS,
      shape: 'cone' as const,
      styleMap: { extreme: 'warning' as const },
    }
    const out = buildOverlayLayers({ datasets: [cone, cone] })
    expect(out.layers.map((l) => l.id)).toEqual(['warnings', 'warnings-2'])
    expect(out.layers[0]).toMatchObject({ kind: 'cone', shape: 'cone' })
    expect((out.layers[0] as { features: { style: string }[] }).features[0]?.style).toBe('warning')
  })

  it('skips coordinates outside the globe instead of failing the set', () => {
    const out = buildOverlayLayers({
      datasets: [
        {
          id: 'bad',
          title: 'Bad',
          collection: {
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [500, 99] } }],
          },
        },
      ],
    })
    expect(out.layers).toEqual([])
    expect(out.skipped[0]?.id).toBe('bad#1')
  })

  it('reports an invalid raster descriptor', () => {
    const out = buildOverlayLayers({ rasters: [{ ...RADAR, width: 99 }] })
    expect(out.layers).toEqual([])
    expect(out.skipped[0]?.reason).toMatch(/expected 297/)
  })
})

describe('time filtering', () => {
  const layers = () => storm()
  const polygons = (at: number | null) =>
    (
      filterAt(layers(), at).find((l) => l.kind === 'polygon') as { features: { id: string }[] }
    ).features.map((f) => f.id)

  it('treats a range as inclusive and an open end as unbounded', () => {
    expect(activeAt({ start: T0, end: T1 }, ms(T1))).toBe(true)
    expect(activeAt({ start: T1 }, ms(T0))).toBe(false)
    expect(activeAt({ end: T1 }, ms(T0))).toBe(true)
    expect(activeAt(undefined, 0)).toBe(true)
  })

  it('shows only the features in force at a moment', () => {
    expect(polygons(ms(T0))).toEqual(['w1'])
    expect(polygons(ms(T1))).toEqual(['w1', 'w2'])
    expect(polygons(ms('2026-06-12T20:30:00Z'))).toEqual(['w2'])
    expect(polygons(null)).toEqual(['w1', 'w2'])
  })

  it('lists the slider steps in order without repeats', () => {
    const steps = timeSteps(layers())
    expect(steps).toEqual([ms(T0), ms(T1), ms(T2), ms(T3)])
    expect(timeSteps([])).toEqual([])
  })

  it('picks the raster frame in force, holding an open-ended frame', () => {
    const r = radar()
    expect(frameAt(r, ms('2026-06-12T17:00:00Z'))).toBeUndefined()
    expect(frameAt(r, ms(T0))?.id).toBe('f1')
    expect(frameAt(r, ms('2026-06-12T19:30:00Z'))).toBeUndefined()
    expect(frameAt(r, ms(T3))?.id).toBe('f2')
    const shown = filterAt([r], ms(T2))[0] as RasterLayer
    expect(shown.frames.map((f) => f.id)).toEqual(['f2'])
    expect(filterAt([r], null)[0]).toMatchObject({ frames: [{ id: 'f2' }] })
  })

  it('formats times in UTC', () => {
    expect(formatStep(ms(T1))).toBe('Jun 12, 19:00 UTC')
    expect(formatRange({ start: T0, end: T1 })).toBe('Jun 12, 18:00 UTC to Jun 12, 19:00 UTC')
    expect(formatRange({ start: T0 })).toBe('from Jun 12, 18:00 UTC')
    expect(formatRange(undefined)).toBe('')
  })
})

describe('legend', () => {
  it('has an entry for every layer, in order, with text for every item', () => {
    const layers = storm()
    const entries = legendEntries(layers)
    expect(entries.map((e) => e.layerId)).toEqual(layers.map((l) => l.id))
    for (const e of entries) {
      expect(e.label.length).toBeGreaterThan(0)
      for (const i of e.items) expect(i.label.length).toBeGreaterThan(0)
    }
  })

  it('names each style of a layer that uses several, and the layer text for one', () => {
    const [warn] = legendEntries(buildOverlayLayers({ datasets: [WARNINGS] }).layers)
    expect(warn?.items.map((i) => i.label)).toEqual(['Critical', 'Watch'])
    const [reports] = legendEntries(buildOverlayLayers({ datasets: [REPORTS] }).layers)
    expect(reports?.items.map((i) => i.label)).toEqual(['Storm reports'])
    const [track] = legendEntries(buildOverlayLayers({ datasets: [TRACK] }).layers)
    expect(track?.swatch).toBe('line')
  })

  it('lists the stops of a colour scale with the unit', () => {
    const [entry] = legendEntries([radar()])
    expect(entry).toMatchObject({ swatch: 'ramp', unit: 'dBZ' })
    expect(entry?.items.map((i) => i.label)).toEqual(['10 dBZ', '35 dBZ', '50 dBZ', '65 dBZ'])
  })
})

describe('raster georeference math', () => {
  it('finds the cell holding a point and treats the east and south edges as inside', () => {
    const r = radar()
    expect(cellAt(r, -85, 39.5)).toEqual({ col: 0, row: 0 })
    expect(cellAt(r, -84.01, 38.81)).toEqual({ col: 3, row: 2 })
    expect(cellAt(r, -84, 38.8)).toEqual({ col: 3, row: 2 })
    expect(cellAt(r, -86, 39)).toBeNull()
    expect(cellAt(r, -84.5, 40)).toBeNull()
  })

  it('reads the value under a point and null where there is no data', () => {
    const r = radar()
    const f = r.frames[0]!
    expect(valueAt(r, f, -84.6, 39.4)).toBe(12)
    expect(valueAt(r, f, -84.1, 39.4)).toBeNull()
    expect(valueAt(r, f, 0, 0)).toBeNull()
  })

  it('round-trips web mercator and spaces rows evenly in the chosen projection', () => {
    expect(latFromMercatorY(mercatorY(39.25))).toBeCloseTo(39.25, 9)
    const r = radar()
    expect(rowEdgeLat(r, 0)).toBe(39.5)
    expect(rowEdgeLat(r, 3)).toBeCloseTo(38.8, 9)
    const merc = { ...r, projection: 'epsg3857' as const }
    expect(rowEdgeLat(merc, 0)).toBeCloseTo(39.5, 9)
    expect(rowEdgeLat(merc, 3)).toBeCloseTo(38.8, 9)
    // Mercator rows are not evenly spaced in latitude: the first row is slightly shorter.
    const first = rowEdgeLat(merc, 0) - rowEdgeLat(merc, 1)
    const last = rowEdgeLat(merc, 2) - rowEdgeLat(merc, 3)
    expect(first).toBeLessThan(last)
    expect(cellAt(merc, -84.5, rowEdgeLat(merc, 1) + 0.001)).toMatchObject({ row: 0 })
  })

  it('redraws a lat/lon grid for a web map and leaves a mercator grid alone', () => {
    // A tall grid over a wide latitude span: rows near the top come from the same source rows.
    const tall = {
      ...radar(),
      width: 1,
      height: 4,
      bbox: [0, 0, 10, 80] as RasterLayer['bbox'],
    }
    const values = [1, 2, 3, 4]
    const out = displayGrid(tall, values)
    // Web maps stretch the north, so the second row still comes from the first source row.
    expect(out).toEqual([1, 1, 2, 4])
    expect(displayGrid({ ...tall, projection: 'epsg3857' }, values)).toEqual(values)
  })

  it('gives the corners of the box for an image source', () => {
    expect(rasterCorners([-85, 38.8, -84, 39.5])).toEqual([
      [-85, 39.5],
      [-84, 39.5],
      [-84, 38.8],
      [-85, 38.8],
    ])
  })

  it('colours values on a continuous and a stepped scale, clear where there is no data', () => {
    const scale = radar().colorScale
    expect(scaleColor(scale, null)).toEqual([0, 0, 0, 0])
    expect(scaleColor(scale, 10)).toEqual([0xcf, 0xe8, 0xf3, 255])
    expect(scaleColor(scale, 99)).toEqual([0x8b, 0x1a, 0x1a, 255])
    const mid = scaleColor(scale, 22.5)
    expect(mid[0]).toBeGreaterThan(0x3a)
    expect(mid[0]).toBeLessThan(0xcf)
    const stepped = { ...scale, mode: 'stepped' as const }
    expect(scaleColor(stepped, 40)).toEqual([0x3a, 0x9d, 0x5d, 255])
    expect(scaleColor(stepped, 5)).toEqual([0, 0, 0, 0])
  })

  it('makes one RGBA pixel per cell and summarises a frame', () => {
    const r = radar()
    const rgba = rasterRgba(r, r.frames[0]!)
    expect(rgba).toHaveLength(12 * 4)
    expect(rasterStats(r.frames[0]!)).toEqual({ min: 5, max: 66, count: 11 })
    expect(rasterStats({ id: 'e', values: [null] })).toBeNull()
  })
})

describe('style tokens', () => {
  it('reads on white at 3:1 for lines and outlines', () => {
    for (const t of OVERLAY_TOKENS)
      expect(contrastRatio(TOKEN_STYLE[t].color, '#ffffff'), t).toBeGreaterThanOrEqual(3)
  })

  it('gives every token its own look beyond colour: no two share a dash and hatch', () => {
    const looks = OVERLAY_TOKENS.map(
      (t) => `${TOKEN_STYLE[t].dash.join(',')}|${TOKEN_STYLE[t].hatch}`,
    )
    expect(new Set(looks).size).toBe(OVERLAY_TOKENS.length)
  })

  it('keeps the default radar scale distinguishable stop to stop', () => {
    const stops = radar().colorScale.stops
    for (let i = 1; i < stops.length; i++)
      expect(contrastRatio(stops[i]!.color, stops[i - 1]!.color)).toBeGreaterThan(1.2)
  })
})

describe('place areas', () => {
  const place = (id: string, positions: unknown[]) =>
    ({ id, label: id.toUpperCase(), kind: 'incident', note: '', positions }) as never
  const area = [
    { lat: 39, lon: -84 },
    { lat: 39, lon: -83.9 },
    { lat: 39.1, lon: -83.9 },
  ]

  it('draws a place outline on a geographic map as a polygon layer', () => {
    const layer = placeAreaLayer(
      [
        place('hq', [{ mapId: 'g', lat: 39, lon: -84, area }]),
        place('other', [{ mapId: 'elsewhere', lat: 1, lon: 1, area }]),
        place('pt', [{ mapId: 'g', lat: 39, lon: -84 }]),
      ],
      'g',
    )
    expect(layer).toMatchObject({ kind: 'polygon', id: 'place-areas' })
    expect(layer?.features).toHaveLength(1)
    expect(layer?.features[0]).toMatchObject({ id: 'hq', label: 'HQ', style: 'critical' })
    expect(layer?.features[0]?.rings[0]?.[0]).toEqual([-84, 39])
    expect(OverlayLayer.safeParse(layer).success).toBe(true)
  })

  it('returns nothing when no place has an outline, and percent outlines for a plan', () => {
    expect(placeAreaLayer([place('a', [{ mapId: 'g', lat: 1, lon: 1 }])], 'g')).toBeUndefined()
    const plan = place('gate', [
      {
        mapId: 'p',
        x: 10,
        y: 10,
        area: [
          { x: 5, y: 5 },
          { x: 20, y: 5 },
          { x: 20, y: 20 },
        ],
      },
    ])
    expect(placeAreasPercent([plan], 'p')).toHaveLength(1)
    expect(placeAreasPercent([plan], 'g')).toHaveLength(0)
  })

  it('puts saved overlays before place outlines for one map', () => {
    const maps = ProjectMaps.parse({
      places: [place('hq', [{ mapId: 'g', lat: 39, lon: -84, area }])],
      overlays: [
        { mapId: 'g', layers: storm() },
        { mapId: 'other', layers: [] },
      ],
    })
    const ids = overlayLayersFor(maps, 'g').map((l) => l.id)
    expect(ids[ids.length - 1]).toBe('place-areas')
    expect(ids).toHaveLength(5)
  })
})
