// Map styles the app draws offline (#436, FR-17). They are small and have no text labels, so no
// glyph or sprite files are needed (labels come with the bundled fonts, a follow-up). One style
// per vector schema: Protomaps (state files) and OpenMapTiles (OpenFreeMap areas and imports).
import type { StyleSpecification, LayerSpecification } from 'maplibre-gl'
import type { BasemapView } from '@shared/ipc'

type Archive = Extract<BasemapView, { mode: 'archive' }>
type Variant = 'light' | 'dark' | 'grayscale'

interface Palette {
  bg: string
  land: string
  water: string
  green: string
  building: string
  road: string
  boundary: string
}

const PALETTES: Record<Variant, Palette> = {
  light: {
    bg: '#f2efe9',
    land: '#ece8df',
    water: '#a8cde8',
    green: '#cfe3c2',
    building: '#d6cfc2',
    road: '#ffffff',
    boundary: '#8a7f9a',
  },
  dark: {
    bg: '#1b1f27',
    land: '#232831',
    water: '#1d3a52',
    green: '#25382b',
    building: '#2e3440',
    road: '#4a5365',
    boundary: '#7a7f99',
  },
  grayscale: {
    bg: '#eeeeee',
    land: '#e6e6e6',
    water: '#c4c4c4',
    green: '#d8d8d8',
    building: '#cfcfcf',
    road: '#ffffff',
    boundary: '#808080',
  },
}

const roadWidth = ['interpolate', ['linear'], ['zoom'], 5, 0.4, 12, 1.5, 16, 6] as never

const fill = (id: string, layer: string, color: string): LayerSpecification => ({
  id,
  type: 'fill',
  source: 'archive',
  'source-layer': layer,
  paint: { 'fill-color': color },
})

const line = (id: string, layer: string, color: string, width: unknown): LayerSpecification => ({
  id,
  type: 'line',
  source: 'archive',
  'source-layer': layer,
  paint: { 'line-color': color, 'line-width': width as never },
  layout: { 'line-cap': 'round', 'line-join': 'round' },
})

function protomapsLayers(p: Palette): LayerSpecification[] {
  return [
    fill('earth', 'earth', p.land),
    fill('landuse', 'landuse', p.green),
    fill('natural', 'natural', p.green),
    fill('water', 'water', p.water),
    fill('buildings', 'buildings', p.building),
    line('roads', 'roads', p.road, roadWidth),
    line('boundaries', 'boundaries', p.boundary, 0.8),
  ]
}

function openMapTilesLayers(p: Palette): LayerSpecification[] {
  return [
    fill('landcover', 'landcover', p.green),
    fill('park', 'park', p.green),
    fill('landuse', 'landuse', p.land),
    fill('water', 'water', p.water),
    line('waterway', 'waterway', p.water, 1),
    fill('building', 'building', p.building),
    line('transportation', 'transportation', p.road, roadWidth),
    line('boundary', 'boundary', p.boundary, 0.8),
  ]
}

/** The style for an installed archive; `tiles` is its asmap:// address template. */
export function archiveStyle(b: Archive, tiles: string, variant: Variant): StyleSpecification {
  const p = PALETTES[variant]
  const common = { minzoom: b.minZoom, maxzoom: b.maxZoom, bounds: b.bounds }
  const background: LayerSpecification = {
    id: 'background',
    type: 'background',
    paint: { 'background-color': p.bg },
  }
  if (b.tileType === 'raster')
    return {
      version: 8,
      sources: { archive: { type: 'raster', tiles: [tiles], tileSize: 256, ...common } },
      layers: [background, { id: 'raster', type: 'raster', source: 'archive' }],
    }
  const layers = b.schema === 'protomaps' ? protomapsLayers(p) : openMapTilesLayers(p)
  return {
    version: 8,
    sources: { archive: { type: 'vector', tiles: [tiles], ...common } },
    layers: [background, ...layers],
  }
}

/** A raster-only style for an online raster provider such as OpenStreetMap. */
export function rasterStyle(tiles: string, tileSize: number): StyleSpecification {
  return {
    version: 8,
    sources: { online: { type: 'raster', tiles: [tiles], tileSize } },
    layers: [{ id: 'online', type: 'raster', source: 'online' }],
  }
}
