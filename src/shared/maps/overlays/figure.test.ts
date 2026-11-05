// Map figures (#652): the drawing shows every kind of overlay, honours the time, escapes text,
// and comes with a summary, a legend and a data table. The drawing is compared with a golden file.
import { describe, expect, it } from 'vitest'
import { RADAR, T0, storm } from './fixtures'
import { legendHtml, mapFigure } from './figure'

const ms = (iso: string): number => Date.parse(iso)

describe('mapFigure', () => {
  it('matches the golden drawing of the storm situation', async () => {
    const fig = mapFigure({
      title: 'Storm situation',
      layers: storm(),
      markers: [
        { n: 1, lat: 39.1, lon: -84.5, label: 'Town hall', kind: 'command' },
        { n: 2, lat: 39.25, lon: -84.3, label: 'Shelter', kind: 'staging' },
      ],
    })
    await expect(fig.svg).toMatchFileSnapshot('__golden__/storm-all.svg')
  })

  it('draws only what is in force at the chosen time but keeps the frame fixed', () => {
    const early = mapFigure({ title: 'T', layers: storm(), at: ms(T0) })
    const late = mapFigure({ title: 'T', layers: storm(), at: ms('2026-06-12T20:30:00Z') })
    expect(early.svg).toContain('Tornado Warning')
    expect(early.svg).not.toContain('Wind damage')
    expect(late.svg).toContain('Wind damage')
    expect(late.svg).not.toContain('Tornado Warning')
    expect(early.summary).toContain('Shown at Jun 12, 18:00 UTC.')
    expect(early.legend.map((e) => e.layerId)).not.toContain('reports')
  })

  it('has a summary, a legend entry per shown layer and a data table row per feature', () => {
    const fig = mapFigure({ title: 'Storm', layers: storm() })
    expect(fig.summary).toMatch(/^Map: Storm\. 4 overlay layers: /)
    expect(fig.summary).toContain(
      'Times run from Jun 12, 18:00 UTC to Jun 12, 21:00 UTC; all are shown.',
    )
    expect(fig.legend).toHaveLength(4)
    expect(fig.table.columns).toEqual(['Layer', 'Item', 'Kind', 'Time', 'Where or value'])
    // 2 warnings + 1 track + 2 reports + the last radar frame.
    expect(fig.table.rows).toHaveLength(6)
    expect(fig.table.rows.find((r) => r[1] === 'Wind damage')?.[4]).toMatch(/near 39\.2000° N/)
    expect(fig.table.rows.find((r) => r[0] === 'Radar reflectivity')?.[4]).toMatch(/dBZ, \d+ cells/)
  })

  it('escapes names so a feature cannot add markup', () => {
    const layers = storm().map((l) =>
      l.kind === 'point'
        ? { ...l, features: [{ ...l.features[0]!, label: '<script>alert(1)</script> & co' }] }
        : l,
    )
    const fig = mapFigure({ title: 'A "quoted" <title>', layers })
    expect(fig.svg).not.toContain('<script>')
    expect(fig.svg).toContain('&#60;script&#62;alert(1)&#60;/script&#62; &#38; co')
    expect(fig.svg).toContain('A &#34;quoted&#34; &#60;title&#62;')
    expect(legendHtml(fig.legend)).not.toContain('<script>')
  })

  it('draws an empty frame when there is nothing to show', () => {
    const fig = mapFigure({ title: 'Empty', layers: [] })
    expect(fig.svg).toContain('<svg')
    expect(fig.summary).toContain('No overlays are shown.')
    expect(fig.legend).toEqual([])
  })

  it('draws raster cells as rectangles in the colour scale', () => {
    const fig = mapFigure({
      title: 'Radar',
      layers: storm().filter((l) => l.kind === 'raster'),
      at: ms('2026-06-12T18:30:00Z'),
    })
    expect(fig.svg).toContain('<rect x=')
    expect(fig.svg.match(/<rect /g)!.length).toBeGreaterThan(5)
    expect(RADAR.frames).toHaveLength(2)
  })

  it('gives each legend swatch a pattern as well as a colour', () => {
    const html = legendHtml(mapFigure({ title: 'x', layers: storm() }).legend)
    expect(html).toContain('stroke-dasharray')
    expect(html).toContain('Warnings and watches')
  })
})
