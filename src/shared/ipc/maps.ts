// maps:* (#436): site plans, places, geographic maps and the map data stored on this computer.
// Network use is limited to maps:fetch and maps:online-setup (online maps on), maps:catalog with
// refresh, maps:download-state, maps:check-updates and maps:area-download, each started by the user.
import { z } from 'zod'
import { channel } from './define'
import { HttpUrl, SafeId } from '../schemas/common'
import {
  Bbox,
  CatalogId,
  MapCatalogEntry,
  MapsSettings,
  ProjectMaps,
  StoredArchive,
} from '../schemas/maps'
import { Sha256Hex } from '../schemas/pack'

const P = z.object({ projectPath: z.string().min(1) })

export const MapsWithRevision = z.object({ maps: ProjectMaps, revision: z.string() })
export type MapsWithRevision = z.infer<typeof MapsWithRevision>

export const CatalogEntryView = z.object({
  entry: MapCatalogEntry,
  installed: z.boolean(),
  updateAvailable: z.boolean(),
  bytes: z.number(),
})
export type CatalogEntryView = z.infer<typeof CatalogEntryView>

export const CatalogView = z.object({
  release: z.string(),
  attribution: z.string(),
  entries: z.array(CatalogEntryView),
  /** True when this is the saved copy because the network was not used or failed. */
  cached: z.boolean(),
  error: z.string().optional(),
})
export type CatalogView = z.infer<typeof CatalogView>

export const AreaRequestShape = z.object({
  bbox: Bbox,
  minZoom: z.number().int().min(0).max(14),
  maxZoom: z.number().int().min(0).max(14),
})

export const AreaPlanView = z.object({
  tiles: z.number(),
  estimatedBytes: z.number(),
  allowed: z.boolean(),
  reason: z.string().optional(),
  suggestedMaxZoom: z.number().optional(),
})
export type AreaPlanView = z.infer<typeof AreaPlanView>

export const StoredArchiveView = StoredArchive.extend({
  /** Names of the projects (recent projects) whose maps use this archive. */
  usedBy: z.array(z.string()),
})
export type StoredArchiveView = z.infer<typeof StoredArchiveView>

/** What the map engine needs to draw one geographic map. */
export const BasemapView = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('offline-off'), message: z.string() }),
  z.object({
    mode: z.literal('missing'),
    message: z.string(),
    /** Catalog ids that can be downloaded, when the source is a state file. */
    catalogIds: z.array(CatalogId).default([]),
    sha256: Sha256Hex.optional(),
  }),
  z.object({
    mode: z.literal('archive'),
    attribution: z.string(),
    tileType: z.enum(['vector', 'raster']),
    schema: z.enum(['protomaps', 'openmaptiles', 'none']),
    bounds: Bbox,
    minZoom: z.number(),
    maxZoom: z.number(),
    builtAt: z.string().optional(),
    sourceName: z.string(),
  }),
  z.object({
    mode: z.literal('online'),
    provider: z.enum(['openfreemap', 'osm', 'custom']),
    attribution: z.string(),
    attributionUrl: z.string().optional(),
    style: z.record(z.string(), z.unknown()).optional(),
    rasterTiles: z.string().optional(),
    tileSize: z.number().optional(),
    prefetch: z.literal(false),
  }),
])
export type BasemapView = z.infer<typeof BasemapView>

const TileBytes = z.object({ data: z.instanceof(Uint8Array), contentType: z.string() })

export const mapsSettingsPatch = z.object({
  online: z
    .object({
      enabled: z.boolean().optional(),
      provider: z.enum(['openfreemap', 'osm', 'custom']).optional(),
      style: z.enum(['liberty', 'positron', 'bright', 'dark']).optional(),
      osmUrl: z.string().max(2048).optional(),
      customUrl: z.string().max(2048).optional(),
      customAttribution: z.string().max(500).optional(),
    })
    .optional(),
  catalogUrl: z.string().max(2048).optional(),
  checkUpdates: z.boolean().optional(),
})

export const mapsChannels = {
  'maps:get': channel(P, MapsWithRevision),
  /** Save maps.json; a stale revision is refused with CONFLICT. */
  'maps:save': channel(P.extend({ maps: ProjectMaps, revision: z.string() }), MapsWithRevision),
  /** Add a site plan from an image the user picked (png, jpg, webp up to 50 megapixels) or one page of a PDF. */
  'maps:import-plan': channel(
    P.extend({
      filePath: z.string().min(1),
      title: z.string().max(120),
      documentId: SafeId.optional(),
      /** The PDF page to use (1-based); ignored for images. */
      page: z.number().int().min(1).max(10000).optional(),
    }),
    MapsWithRevision.extend({ mapId: SafeId }),
  ),
  /** Import the user's own .pmtiles or .mbtiles into the store. */
  'maps:import-archive': channel(
    z.object({
      filePath: z.string().min(1),
      title: z.string().max(200),
      attribution: z.string().max(500).optional(),
    }),
    StoredArchive,
  ),
  'maps:settings-set': channel(mapsSettingsPatch, MapsSettings),
  'maps:catalog': channel(z.object({ refresh: z.boolean() }), CatalogView),
  'maps:download-state': channel(
    z.object({ ids: z.array(CatalogId).min(1).max(8) }),
    z.object({ jobId: SafeId }),
  ),
  'maps:check-updates': channel(
    z.void(),
    z.object({
      updates: z.array(
        z.object({
          id: z.string(),
          installedSha: z.string(),
          latestSha: z.string(),
          bytes: z.number(),
        }),
      ),
    }),
  ),
  'maps:area-plan': channel(AreaRequestShape, AreaPlanView),
  'maps:area-download': channel(
    AreaRequestShape.extend({ title: z.string().min(1).max(200) }),
    z.object({ jobId: SafeId }),
  ),
  /** How to draw a geo map: an archive, the online provider, or why it cannot be drawn. */
  'maps:basemap': channel(P.extend({ mapId: SafeId }), BasemapView),
  /** One tile of a stored archive for a geo map; an empty `data` means no tile there. */
  'maps:tile': channel(
    P.extend({
      mapId: SafeId,
      z: z.number().int().min(0).max(30),
      x: z.number().int().min(0),
      y: z.number().int().min(0),
    }),
    TileBytes,
  ),
  /** A tile, style, glyph range or sprite from the online provider (online maps on only). */
  'maps:fetch': channel(z.object({ url: HttpUrl }), TileBytes),
  'maps:store': channel(z.void(), z.array(StoredArchiveView)),
  'maps:store-delete': channel(z.object({ sha256: Sha256Hex }), z.object({})),
  /** Copy a map's archives into the project so it can move to another computer. */
  'maps:copy-into-project': channel(P.extend({ mapId: SafeId }), z.object({ copied: z.number() })),
  /**
   * A PNG of a site plan with numbered markers for the places the audience may see (spec 0436 §5),
   * written under `.cache/maps/`. Geographic maps are refused until they can be drawn.
   */
  'maps:snapshot': channel(
    P.extend({
      scenarioId: SafeId,
      mapId: SafeId,
      audience: z.enum(['facilitator', 'room', 'device']),
    }),
    z.object({ path: z.string() }),
  ),
  /** Point a map at a file the user has, accepted only when its sha256 matches. */
  'maps:locate': channel(P.extend({ mapId: SafeId, filePath: z.string().min(1) }), z.object({})),
}
