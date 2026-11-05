// Map overlays in snapshots (#652): a geographic map's picture holds its overlays at the chosen
// time, numbered places only from geographic positions, a legend, and escaped text. The PNG itself
// is drawn by the render window and checked in e2e/maps.spec.ts.
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { storm } from '@shared/maps/overlays/fixtures'
import type { Pin } from '@shared/maps/pins'
import { ProjectMaps } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0', getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_RESOURCES = resolve('.')

const { geoFigure, geoFigureDocument, geoMarkers, MAX_GEO_MARKERS } =
  await import('./overlay-snapshot')

const pin = (id: string, position: Pin['position'], label = id): Pin => ({
  placeId: id,
  label,
  kind: 'command',
  position,
  rows: [{ rowId: 'I-01', status: 'delivered' }],
  status: 'delivered',
})
const maps = ProjectMaps.parse({ overlays: [{ mapId: 'g', layers: storm() }] })

describe('geoMarkers', () => {
  it('numbers geographic pins in order and skips site plan pins', () => {
    const out = geoMarkers([
      pin('a', { mapId: 'g', lat: 39.1, lon: -84.5 }),
      pin('plan', { mapId: 'p', x: 1, y: 2 }),
      pin('b', { mapId: 'g', lat: 39.2, lon: -84.3 }),
    ])
    expect(out.map((m) => [m.n, m.label, m.rows])).toEqual([
      [1, 'a', 'I-01'],
      [2, 'b', 'I-01'],
    ])
  })

  it('keeps at most twelve', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      pin(`p${i}`, { mapId: 'g', lat: 39 + i / 100, lon: -84 }),
    )
    expect(geoMarkers(many)).toHaveLength(MAX_GEO_MARKERS)
  })
})

describe('geoFigure and its page', () => {
  it('shows the overlays in force at the chosen time and every overlay without one', () => {
    const base = { title: 'Harbor', maps, mapId: 'g', pins: [] }
    const early = geoFigure({ ...base, at: '2026-06-12T18:30:00Z' }).fig
    const all = geoFigure(base).fig
    expect(early.svg).toContain('Tornado Warning')
    expect(early.svg).not.toContain('Wind damage')
    expect(all.svg).toContain('Wind damage')
    expect(all.legend.length).toBeGreaterThan(early.legend.length)
  })

  it('ignores a time it cannot read', () => {
    const { fig } = geoFigure({ title: 'H', maps, mapId: 'g', pins: [], at: 'soon' })
    expect(fig.summary).toContain('all are shown')
  })

  it('builds a page with the legend, summary and escaped title', () => {
    const { fig, markers } = geoFigure({
      title: 'Harbor <b>',
      maps,
      mapId: 'g',
      pins: [pin('a', { mapId: 'g', lat: 39.1, lon: -84.5 }, 'Town <hall>')],
    })
    const doc = geoFigureDocument('Harbor <b>', fig, markers)
    expect(doc.html).toContain('Harbor &#60;b&#62;')
    expect(doc.html).toContain('Town &#60;hall&#62;')
    expect(doc.html).not.toContain('<hall>')
    expect(doc.html).toContain('Warnings and watches')
    expect(doc.html).toContain('class="inject-root"')
    expect(doc.html).toContain('Content-Security-Policy')
    expect(doc.meta.width).toBe(1000)
  })
})
