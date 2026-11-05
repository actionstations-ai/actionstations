// Overlay layers for MapLibre (#652): the specs are plain data, so they are checked without
// WebGL. Order is rasters, areas, lines, points; every token has its own outline layer with its
// own dash; a hidden layer produces nothing.
import { describe, expect, it } from 'vitest'
import { storm } from '@shared/maps/overlays/fixtures'
import { OVERLAY_TOKENS } from '@shared/schemas'
import { TOKEN_STYLE } from '@shared/maps/overlays/style'
import { applyOverlays, overlaySpecs } from './geo/overlay-layers'

const canvas = () => ({ width: 4, height: 3 }) as unknown as HTMLCanvasElement

describe('overlaySpecs', () => {
  const specs = overlaySpecs(storm(), canvas)

  it('draws rasters under areas, areas under lines and lines under points', () => {
    const kinds = specs.layers.map((l) => l.id.replace(/^ov-/, '').split('-').pop())
    const first = (k: string) => specs.layers.findIndex((l) => l.id.includes(k))
    expect(first('radar')).toBe(0)
    expect(first('warnings-fill')).toBeLessThan(first('track-line'))
    expect(first('track-line')).toBeLessThan(first('reports-circle'))
    expect(kinds.length).toBeGreaterThan(8)
  })

  it('makes a canvas image source for a raster, placed by its corners', () => {
    expect(specs.sources['ov-radar']).toMatchObject({
      type: 'canvas',
      animate: false,
      coordinates: [
        [-85, 39.5],
        [-84, 39.5],
        [-84, 38.8],
        [-85, 38.8],
      ],
    })
  })

  it('gives each token its own outline layer with the token dash', () => {
    const lines = specs.layers.filter((l) => l.id.startsWith('ov-warnings-line-'))
    expect(lines.map((l) => l.id.replace('ov-warnings-line-', ''))).toEqual([...OVERLAY_TOKENS])
    const watch = lines.find((l) => l.id.endsWith('-watch'))
    expect(watch?.paint).toMatchObject({ 'line-dasharray': TOKEN_STYLE.watch.dash })
    const critical = lines.find((l) => l.id.endsWith('-critical'))
    expect((critical?.paint as Record<string, unknown>)['line-dasharray']).toBeUndefined()
  })

  it('closes polygon rings and carries the style in the feature properties', () => {
    const data = (
      specs.sources['ov-warnings'] as {
        data: {
          features: {
            geometry: { coordinates: number[][][] }
            properties: Record<string, unknown>
          }[]
        }
      }
    ).data
    const ringPts = data.features[0]!.geometry.coordinates[0]!
    expect(ringPts[0]).toEqual(ringPts[ringPts.length - 1])
    expect(data.features[0]!.properties).toMatchObject({
      style: 'critical',
      label: 'Tornado Warning',
    })
  })

  it('draws a track with dots at its vertices and skips a raster that cannot be drawn', () => {
    expect(specs.layers.some((l) => l.id === 'ov-track-dots-circle')).toBe(true)
    const none = overlaySpecs(
      storm().filter((l) => l.kind === 'raster'),
      () => null,
    )
    expect(none.layers).toEqual([])
  })

  it('gives nothing for no layers', () => {
    expect(overlaySpecs([])).toEqual({ sources: {}, layers: [] })
  })
})

describe('applyOverlays', () => {
  it('removes the old overlay layers and sources before adding the new ones', () => {
    const calls: string[] = []
    const map = {
      getStyle: () => ({
        layers: [{ id: 'water' }, { id: 'ov-old-fill' }],
        sources: { basemap: {}, 'ov-old': {} },
      }),
      removeLayer: (id: string) => calls.push(`-layer ${id}`),
      removeSource: (id: string) => calls.push(`-source ${id}`),
      addSource: (id: string) => calls.push(`+source ${id}`),
      addLayer: (l: { id: string }) => calls.push(`+layer ${l.id}`),
    }
    applyOverlays(
      map as never,
      storm().filter((l) => l.kind === 'point'),
    )
    expect(calls).toEqual([
      '-layer ov-old-fill',
      '-source ov-old',
      '+source ov-reports',
      '+layer ov-reports-circle',
    ])
  })
})
