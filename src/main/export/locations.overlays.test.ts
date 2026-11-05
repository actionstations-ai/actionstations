// Map overlays in exports (#652): a geographic map with overlays gets a Locations page with the
// drawing, its legend, a text summary and a data table, in the MSEL and the handbook. A map with
// overlays but no places the MSEL uses still gets its page; a map without overlays is unchanged.
import { describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { storm } from '@shared/maps/overlays/fixtures'
import type { ProjectMaps } from '@shared/schemas'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { fixtureModel } = await import('../../../tests/fixtures/export/model')
const { buildDocumentHtml } = await import('./documents')
const { locationPages } = await import('./locations')

const at = [{ mapId: 'harbor', lat: 39.1, lon: -84.5 }]
const maps = (overlays: ProjectMaps['overlays']): ProjectMaps => ({
  formatVersion: 1,
  maps: [
    {
      kind: 'geo',
      id: 'harbor',
      title: 'Harbor',
      basemap: { kind: 'online', provider: 'openfreemap' },
      style: 'light',
    },
  ],
  places: [{ id: 'pier', label: 'Pier 4', kind: 'incident', note: '', positions: at }],
  ...(overlays ? { overlays } : {}),
})

describe('Locations pages with overlays', () => {
  it('draws the overlays with the numbered place inside the drawing, a legend and a data table', () => {
    const model = fixtureModel()
    model.scenario.msel[0] = { ...model.scenario.msel[0]!, placeIds: ['pier'] }
    model.maps = maps([{ mapId: 'harbor', layers: storm() }])
    for (const doc of ['msel', 'handbook'] as const) {
      const html = buildDocumentHtml(model, doc, 'pdf')
      expect(html, doc).toContain('<svg xmlns=')
      expect(html, doc).toContain('Tornado Warning')
      expect(html, doc).toContain('Warnings and watches')
      expect(html, doc).toContain('class="mapfig-table"')
      expect(html, doc).toContain('Radar reflectivity')
      expect(html, doc).not.toContain('class="locations__pin')
      expect(html, doc).not.toContain('class="locations__blank"')
      expect(html, doc).toContain('Pier 4')
    }
  })

  it('gives a map with overlays and no used places its own page', () => {
    const model = fixtureModel()
    model.maps = maps([{ mapId: 'harbor', layers: storm() }])
    const pages = locationPages(model.maps, model.scenario)
    expect(pages).toHaveLength(1)
    expect(pages[0]?.markers).toEqual([])
    expect(pages[0]?.overlay?.rows.length).toBeGreaterThan(0)
  })

  it('draws place outlines as an overlay layer', () => {
    const model = fixtureModel()
    model.scenario.msel[0] = { ...model.scenario.msel[0]!, placeIds: ['pier'] }
    const m = maps(undefined)
    m.places[0]!.positions = [
      {
        ...at[0]!,
        area: [
          { lat: 39.0, lon: -84.6 },
          { lat: 39.0, lon: -84.4 },
          { lat: 39.2, lon: -84.4 },
        ],
      },
    ]
    model.maps = m
    const page = locationPages(model.maps, model.scenario)[0]
    expect(page?.overlay?.legend).toContain('Place areas')
    expect(page?.overlay?.rows[0]?.[1]).toBe('Pier 4')
  })

  it('leaves a map without overlays as it was', () => {
    const model = fixtureModel()
    model.scenario.msel[0] = { ...model.scenario.msel[0]!, placeIds: ['pier'] }
    model.maps = maps(undefined)
    const page = locationPages(model.maps, model.scenario)[0]
    expect(page?.overlay).toBeUndefined()
    expect(buildDocumentHtml(model, 'msel', 'pdf')).toContain('class="locations__blank"')
  })
})
