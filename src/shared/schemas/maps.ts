// Maps (#436): site plans, geographic maps, places pinned on them, and the map data installed
// on this computer. See docs/specs/0436-map-view.md.
import { z } from 'zod'
import { HttpUrl, Id, IsoDateTime, RelPath, SafeId } from './common'
import { Sha256Hex } from './pack'

export const PercentPoint = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
})
export type PercentPoint = z.infer<typeof PercentPoint>

export const GeoPoint = z.object({
  lat: z.number().min(-85.06).max(85.06),
  lon: z.number().min(-180).max(180),
})
export type GeoPoint = z.infer<typeof GeoPoint>

/** West, south, east, north in degrees. */
export const Bbox = z.tuple([z.number(), z.number(), z.number(), z.number()])
export type Bbox = z.infer<typeof Bbox>

export const CatalogId = z.string().regex(/^[a-z0-9-]{2,24}$/)

export const BasemapSource = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('online'),
    provider: z.enum(['openfreemap', 'osm', 'custom']),
    /** OpenFreeMap style name. */
    style: z.string().max(40).optional(),
    url: HttpUrl.optional(),
    attribution: z.string().max(500).optional(),
  }),
  /** Installed state files, by catalog id ("us-oh"); several for a cross-state region. */
  z.object({ kind: z.literal('catalog'), ids: z.array(CatalogId).min(1).max(8) }),
  z.object({ kind: z.literal('area'), sha256: Sha256Hex }),
  z.object({ kind: z.literal('file'), sha256: Sha256Hex }),
])
export type BasemapSource = z.infer<typeof BasemapSource>

export const MapLayer = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('site_plan'),
    id: SafeId,
    title: z.string().max(120),
    /** The original file, `maps/<id>/source.<ext>`. */
    source: RelPath,
    /** The display image, `maps/<id>/plan.png`. */
    image: RelPath,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    documentId: Id.optional(),
    floor: z.string().max(40).optional(),
  }),
  z.object({
    kind: z.literal('geo'),
    id: SafeId,
    title: z.string().max(120),
    basemap: BasemapSource,
    /** For example online while planning, a state file in the room. */
    fallback: BasemapSource.optional(),
    view: z.object({ center: GeoPoint, zoom: z.number().min(0).max(22) }).optional(),
    style: z.enum(['light', 'dark', 'grayscale']).default('light'),
  }),
])
export type MapLayer = z.infer<typeof MapLayer>

export const PlacePosition = z.union([
  z
    .object({ mapId: SafeId })
    .extend(PercentPoint.shape)
    .extend({ area: z.array(PercentPoint).max(32).optional() }),
  z
    .object({ mapId: SafeId })
    .extend(GeoPoint.shape)
    .extend({ area: z.array(GeoPoint).max(32).optional() }),
])
export type PlacePosition = z.infer<typeof PlacePosition>

export const PLACE_KINDS = ['incident', 'staging', 'command', 'asset', 'public', 'other'] as const

export const Place = z.object({
  id: SafeId,
  label: z.string().min(1).max(80),
  kind: z.enum(PLACE_KINDS).default('other'),
  /** A facility fact, "<categoryId>:<entry>" (for example "gates:A1"). */
  factRef: z.string().max(200).optional(),
  positions: z.array(PlacePosition).max(20).default([]),
  note: z.string().max(500).default(''),
})
export type Place = z.infer<typeof Place>

export const MAX_MAPS = 20
export const MAX_PLACES = 500

export const ProjectMaps = z.looseObject({
  formatVersion: z.literal(1).default(1),
  defaultMapId: SafeId.optional(),
  maps: z.array(MapLayer).max(MAX_MAPS).default([]),
  places: z.array(Place).max(MAX_PLACES).default([]),
})
export type ProjectMaps = z.infer<typeof ProjectMaps>

export const OFFICIAL_MAP_CATALOG_URL =
  'https://github.com/actionstations-ai/maps/releases/latest/download/catalog.json'

/** Maps settings in AppSettings. Online maps are off until the user turns them on (FR-10). */
export const MapsSettings = z.object({
  online: z
    .object({
      enabled: z.boolean().default(false),
      provider: z.enum(['openfreemap', 'osm', 'custom']).default('openfreemap'),
      style: z.enum(['liberty', 'positron', 'bright', 'dark']).default('liberty'),
      osmUrl: HttpUrl.optional(),
      customUrl: HttpUrl.optional(),
      customAttribution: z.string().max(500).optional(),
    })
    .default(() => ({
      enabled: false,
      provider: 'openfreemap' as const,
      style: 'liberty' as const,
    })),
  catalogUrl: HttpUrl.default(OFFICIAL_MAP_CATALOG_URL),
  /** Also check the map catalog when the app checks for updates (#442 must be on). */
  checkUpdates: z.boolean().default(false),
  /** The last automatic catalog check: when, and the catalog ids that have a newer file. */
  lastCatalogCheck: z
    .object({ at: IsoDateTime, updates: z.array(z.string().max(40)).max(80) })
    .optional(),
})
export type MapsSettings = z.infer<typeof MapsSettings>

/** The state map catalog published by actionstations-ai/maps (FR-14, Design §6). */
export const MapCatalogPart = z.object({
  url: HttpUrl,
  bytes: z.number().int().positive(),
  sha256: Sha256Hex,
})
export const MapCatalogEntry = z.object({
  id: CatalogId,
  name: z.string().max(120),
  kind: z.enum(['state', 'district', 'territory']),
  bbox: Bbox,
  minZoom: z.number().int(),
  maxZoom: z.number().int(),
  parts: z.array(MapCatalogPart).min(1).max(8),
})
export type MapCatalogEntry = z.infer<typeof MapCatalogEntry>

export const MapCatalog = z.object({
  formatVersion: z.literal(1),
  release: z.string().max(64),
  generatedAt: IsoDateTime,
  source: z.object({ name: z.string().max(200), build: z.string().max(100), url: HttpUrl }),
  license: z.literal('ODbL-1.0'),
  attribution: z.string().max(500),
  entries: z.array(MapCatalogEntry).max(100),
})
export type MapCatalog = z.infer<typeof MapCatalog>

/** One archive in the app-level store (Design §2). */
export const StoredArchive = z.object({
  sha256: Sha256Hex,
  kind: z.enum(['catalog', 'area', 'file']),
  format: z.enum(['pmtiles', 'mbtiles']),
  title: z.string().max(200),
  bytes: z.number().int().nonnegative(),
  bounds: Bbox,
  minZoom: z.number().int(),
  maxZoom: z.number().int(),
  /** Vector tiles use a style; raster archives are drawn as they are. */
  tileType: z.enum(['vector', 'raster']),
  /** Which vector layer names the tiles use; picks the bundled style. */
  schema: z.enum(['protomaps', 'openmaptiles', 'none']).default('none'),
  attribution: z.string().max(500),
  /** Catalog id ("us-oh") and part number for state files. */
  catalogId: CatalogId.optional(),
  part: z.number().int().min(0).optional(),
  /** The catalog release or area build date, shown in the list and in exports. */
  builtAt: z.string().max(40).optional(),
  addedAt: IsoDateTime,
})
export type StoredArchive = z.infer<typeof StoredArchive>

export const MapStore = z.object({
  formatVersion: z.literal(1).default(1),
  archives: z.array(StoredArchive).default([]),
})
export type MapStore = z.infer<typeof MapStore>
