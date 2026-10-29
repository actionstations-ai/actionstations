// Choosing how to draw a geographic map (#436): WebGL check, motion preference, and the style
// and attribution for a basemap that can be drawn.
import type { StyleSpecification } from 'maplibre-gl'
import type { BasemapView } from '@shared/ipc'
import type { MapLayer } from '@shared/schemas'
import { archiveStyle, rasterStyle } from './styles'

type Geo = Extract<MapLayer, { kind: 'geo' }>

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'))
  } catch {
    return false
  }
}

export const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export interface Plan {
  style: StyleSpecification
  attribution: string
  attributionUrl?: string | undefined
  bounds?: [number, number, number, number]
}

/** The style, attribution and starting bounds for a basemap that can be drawn. */
export function planFor(b: BasemapView, projectPath: string, layer: Geo): Plan | undefined {
  if (b.mode === 'archive') {
    const tiles = `asmap://a/${encodeURIComponent(projectPath)}/${layer.id}/{z}/{x}/{y}`
    return {
      style: archiveStyle(b, tiles, layer.style),
      attribution: b.attribution,
      bounds: b.bounds,
    }
  }
  if (b.mode !== 'online') return undefined
  const style = b.style
    ? (b.style as unknown as StyleSpecification)
    : rasterStyle(b.rasterTiles ?? '', b.tileSize ?? 256)
  return { style, attribution: b.attribution, attributionUrl: b.attributionUrl }
}
