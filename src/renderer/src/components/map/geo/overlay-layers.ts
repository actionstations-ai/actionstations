// Overlay layers as MapLibre sources and layers (#652). The specs are plain data, so they are
// tested without WebGL; `applyOverlays` is the only part that touches a live map. Polygons and
// cones get one outline layer per style token because MapLibre does not vary a dash pattern by
// feature, and each token has its own dash (colour is never the only cue).
import type {
  CanvasSourceSpecification,
  GeoJSONSourceSpecification,
  LayerSpecification,
  Map as MapLibreMap,
} from 'maplibre-gl'
import { OVERLAY_TOKENS, type OverlayLayer, type OverlayToken } from '@shared/schemas'
import { rasterCorners, rasterRgba } from '@shared/maps/overlays/raster'
import { TOKEN_STYLE } from '@shared/maps/overlays/style'

export const OVERLAY_PREFIX = 'ov-'

type Source = GeoJSONSourceSpecification | CanvasSourceSpecification
interface Feat {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry: { type: string; coordinates: unknown }
}

const collection = (features: Feat[]): GeoJSONSourceSpecification => ({
  type: 'geojson',
  data: { type: 'FeatureCollection', features } as unknown as GeoJSONSourceSpecification['data'],
})

export interface OverlaySpecs {
  sources: Record<string, Source>
  layers: LayerSpecification[]
}

const sourceId = (layer: OverlayLayer): string => `${OVERLAY_PREFIX}${layer.id}`

function featureProps(f: { id: string; label: string; style: OverlayToken }) {
  const st = TOKEN_STYLE[f.style]
  return { id: f.id, label: f.label, style: f.style, color: st.color, fill: st.fill }
}

const ring = (r: [number, number][]): [number, number][] => {
  const first = r[0]!
  const last = r[r.length - 1]!
  return first[0] === last[0] && first[1] === last[1] ? r : [...r, first]
}

function areaSource(
  layer: Extract<OverlayLayer, { kind: 'polygon' | 'cone' }>,
): GeoJSONSourceSpecification {
  const features: Feat[] = layer.features.map((f) => ({
    type: 'Feature',
    properties: featureProps(f),
    geometry: { type: 'Polygon', coordinates: f.rings.map(ring) },
  }))
  return collection(features)
}

function lineSource(
  layer: Extract<OverlayLayer, { kind: 'line' | 'cone' }>,
): GeoJSONSourceSpecification {
  const features: Feat[] = []
  for (const f of layer.features) {
    const path =
      layer.kind === 'line'
        ? (f as { path: [number, number][] }).path
        : (f as { centerline?: [number, number][] }).centerline
    if (path)
      features.push({
        type: 'Feature',
        properties: featureProps(f),
        geometry: { type: 'LineString', coordinates: path },
      })
  }
  return collection(features)
}

function pointSource(layer: Extract<OverlayLayer, { kind: 'point' }>): GeoJSONSourceSpecification {
  const features: Feat[] = layer.features.map((f) => ({
    type: 'Feature',
    properties: { ...featureProps(f), value: f.value ?? null },
    geometry: { type: 'Point', coordinates: f.at },
  }))
  return collection(features)
}

const dash = (token: OverlayToken): number[] | undefined => {
  const d = TOKEN_STYLE[token].dash
  return d.length ? d : undefined
}

/** One outline layer per token, each drawing only that token's features. */
function outlines(id: string, source: string, width: number): LayerSpecification[] {
  return OVERLAY_TOKENS.map((token): LayerSpecification => {
    const d = dash(token)
    return {
      id: `${id}-line-${token}`,
      type: 'line',
      source,
      filter: ['==', ['get', 'style'], token],
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': TOKEN_STYLE[token].color,
        'line-width': width,
        ...(d ? { 'line-dasharray': d } : {}),
      },
    }
  })
}

function rasterCanvas(layer: Extract<OverlayLayer, { kind: 'raster' }>): HTMLCanvasElement | null {
  const frame = layer.frames[layer.frames.length - 1]
  if (!frame || typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = layer.width
  canvas.height = layer.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const pixels = rasterRgba(layer, frame)
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), layer.width, layer.height), 0, 0)
  return canvas
}

/** Sources and layers for these layers, bottom to top: rasters, areas, lines, points. */
export function overlaySpecs(
  layers: readonly OverlayLayer[],
  makeCanvas: typeof rasterCanvas = rasterCanvas,
): OverlaySpecs {
  const sources: Record<string, Source> = {}
  const out: LayerSpecification[] = []
  const order: OverlayLayer['kind'][] = ['raster', 'polygon', 'cone', 'line', 'point']
  const sorted = [...layers].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
  for (const layer of sorted) {
    const id = sourceId(layer)
    if (layer.kind === 'raster') {
      const canvas = makeCanvas(layer)
      if (!canvas) continue
      sources[id] = {
        type: 'canvas',
        canvas,
        coordinates: rasterCorners(layer.bbox),
        animate: false,
      }
      out.push({
        id: `${id}-raster`,
        type: 'raster',
        source: id,
        paint: {
          'raster-opacity': layer.opacity,
          'raster-resampling': 'nearest',
          'raster-fade-duration': 0,
        },
      })
    } else if (layer.kind === 'polygon' || layer.kind === 'cone') {
      sources[id] = areaSource(layer)
      out.push({
        id: `${id}-fill`,
        type: 'fill',
        source: id,
        paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': layer.opacity * 0.6 },
      })
      out.push(...outlines(id, id, 2))
      if (layer.kind === 'cone') {
        const centre = `${id}-center`
        sources[centre] = lineSource(layer)
        out.push({
          id: `${centre}-line`,
          type: 'line',
          source: centre,
          paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [3, 2] },
        })
      }
    } else if (layer.kind === 'line') {
      sources[id] = lineSource(layer)
      out.push(...outlines(id, id, 3))
      if (layer.track) {
        const dots = `${id}-dots`
        sources[dots] = collection(
          layer.features.flatMap((f) =>
            f.path.map((p): Feat => ({
              type: 'Feature',
              properties: featureProps(f),
              geometry: { type: 'Point', coordinates: p },
            })),
          ),
        )
        out.push({
          id: `${dots}-circle`,
          type: 'circle',
          source: dots,
          paint: {
            'circle-radius': 3,
            'circle-color': '#ffffff',
            'circle-stroke-color': ['get', 'color'],
            'circle-stroke-width': 1.5,
          },
        })
      }
    } else {
      sources[id] = pointSource(layer)
      out.push({
        id: `${id}-circle`,
        type: 'circle',
        source: id,
        paint: {
          'circle-radius': 6,
          'circle-color': ['get', 'fill'],
          'circle-opacity': 0.7,
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-width': 2,
        },
      })
    }
  }
  return { sources, layers: out }
}

/** Replace whatever overlays the map holds with these layers. */
export function applyOverlays(map: MapLibreMap, layers: readonly OverlayLayer[]): void {
  const style = map.getStyle()
  for (const l of style?.layers ?? []) if (l.id.startsWith(OVERLAY_PREFIX)) map.removeLayer(l.id)
  for (const id of Object.keys(style?.sources ?? {}))
    if (id.startsWith(OVERLAY_PREFIX)) map.removeSource(id)
  const specs = overlaySpecs(layers)
  for (const [id, source] of Object.entries(specs.sources)) map.addSource(id, source)
  for (const layer of specs.layers) map.addLayer(layer)
}
