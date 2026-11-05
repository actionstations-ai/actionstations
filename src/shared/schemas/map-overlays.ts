// Map overlays (#652, spec 0448 FR-11): what is drawn on a map besides the basemap and the places.
// The model does not care where the data came from: layers of polygons, lines and tracks, cones
// and swaths, points, and georeferenced rasters with a colour scale. Every layer has a legend
// entry, every feature can carry a time range, and colours come from style tokens so that each
// one also has a line pattern (colour is never the only cue).
import { z } from 'zod'
import { IsoDateTime, SafeId } from './common'

/** Longitude, latitude in degrees (the GeoJSON order). */
export const LonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
export type LonLat = z.infer<typeof LonLat>

export const OVERLAY_TOKENS = [
  'neutral',
  'info',
  'watch',
  'warning',
  'critical',
  'ok',
  'water',
  'muted',
] as const
export const OverlayToken = z.enum(OVERLAY_TOKENS)
export type OverlayToken = z.infer<typeof OverlayToken>

export const OverlayTime = z
  .object({ start: IsoDateTime.optional(), end: IsoDateTime.optional() })
  .refine((t) => !t.start || !t.end || Date.parse(t.start) <= Date.parse(t.end), {
    message: 'The end is before the start',
  })
export type OverlayTime = z.infer<typeof OverlayTime>

export const MAX_RING_POINTS = 2000
export const MAX_FEATURES = 2000
export const MAX_RASTER_CELLS = 262144
export const MAX_RASTER_FRAMES = 48
export const MAX_OVERLAY_LAYERS = 40
export const MAX_OVERLAY_SETS = 20

const Ring = z.array(LonLat).min(3).max(MAX_RING_POINTS)
const Path = z.array(LonLat).min(2).max(MAX_RING_POINTS)

const featureBase = {
  id: z.string().min(1).max(120),
  label: z.string().max(160).default(''),
  /** One sentence of detail for the data table, for example "Wind 70 mph". */
  detail: z.string().max(500).optional(),
  time: OverlayTime.optional(),
  style: OverlayToken.default('neutral'),
  /** Names the style in the legend when one layer carries several (for example "Warning"). */
  legendLabel: z.string().max(80).optional(),
}

export const PolygonFeature = z.object({
  ...featureBase,
  /** The outer ring first, then holes. Rings need not repeat the first point. */
  rings: z.array(Ring).min(1).max(64),
})
export const LineFeature = z.object({ ...featureBase, path: Path })
export const ConeFeature = z.object({
  ...featureBase,
  rings: z.array(Ring).min(1).max(8),
  /** The centre line of a cone (a storm track), drawn dashed. */
  centerline: Path.optional(),
})
export const PointFeature = z.object({
  ...featureBase,
  at: LonLat,
  /** A reading, for example a gauge height. */
  value: z.number().optional(),
  unit: z.string().max(24).optional(),
})

export const OverlayLegend = z.object({
  label: z.string().min(1).max(80),
  note: z.string().max(240).optional(),
})
export type OverlayLegend = z.infer<typeof OverlayLegend>

const layerBase = {
  id: SafeId,
  title: z.string().min(1).max(120),
  legend: OverlayLegend,
  /** Shown when the map opens. */
  visible: z.boolean().default(true),
  opacity: z.number().min(0.05).max(1).default(0.7),
  /** Where the data came from, shown in the data table. */
  source: z.string().max(200).optional(),
}

export const ColorStop = z.object({
  value: z.number(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  label: z.string().max(40).optional(),
})
export const ColorScale = z
  .object({
    stops: z.array(ColorStop).min(2).max(16),
    unit: z.string().max(24).default(''),
    /** Blend between stops, or hold each stop's colour up to the next one. */
    mode: z.enum(['continuous', 'stepped']).default('continuous'),
  })
  .refine((s) => s.stops.every((st, i) => i === 0 || st.value > s.stops[i - 1]!.value), {
    message: 'Colour stops must increase',
  })
export type ColorScale = z.infer<typeof ColorScale>

export const RasterFrame = z.object({
  id: z.string().min(1).max(120),
  label: z.string().max(120).optional(),
  time: OverlayTime.optional(),
  /** Row-major from the top (north) row; null is no data. */
  values: z.array(z.number().nullable()).max(MAX_RASTER_CELLS),
})
export type RasterFrame = z.infer<typeof RasterFrame>

export const OverlayLayer = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('polygon'),
      ...layerBase,
      features: z.array(PolygonFeature).max(MAX_FEATURES),
    }),
    z.object({
      kind: z.literal('line'),
      ...layerBase,
      /** A track shows a dot at each vertex. */
      track: z.boolean().default(false),
      features: z.array(LineFeature).max(MAX_FEATURES),
    }),
    z.object({
      kind: z.literal('cone'),
      ...layerBase,
      /** A cone narrows along a centre line; a swath is a band of even width. */
      shape: z.enum(['cone', 'swath']).default('cone'),
      features: z.array(ConeFeature).max(MAX_FEATURES),
    }),
    z.object({
      kind: z.literal('point'),
      ...layerBase,
      features: z.array(PointFeature).max(MAX_FEATURES),
    }),
    z.object({
      kind: z.literal('raster'),
      ...layerBase,
      width: z.number().int().min(1).max(1024),
      height: z.number().int().min(1).max(1024),
      /** West, south, east, north of the outer edges of the grid, in degrees. */
      bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      /**
       * How rows are spaced: evenly in latitude (a plain lat/lon grid) or evenly in web
       * mercator northing (a grid cut from web map tiles).
       */
      projection: z.enum(['epsg4326', 'epsg3857']).default('epsg4326'),
      colorScale: ColorScale,
      frames: z.array(RasterFrame).min(1).max(MAX_RASTER_FRAMES),
    }),
  ])
  .superRefine((layer, ctx) => {
    if (layer.kind !== 'raster') return
    const [w, s, e, n] = layer.bbox
    if (!(e > w) || !(n > s) || s < -85.06 || n > 85.06 || w < -180 || e > 180)
      ctx.addIssue({ code: 'custom', message: 'The raster bounds are not a valid box' })
    if (layer.width * layer.height > MAX_RASTER_CELLS)
      ctx.addIssue({ code: 'custom', message: 'The raster grid is too large' })
    layer.frames.forEach((f, i) => {
      if (f.values.length !== layer.width * layer.height)
        ctx.addIssue({
          code: 'custom',
          path: ['frames', i, 'values'],
          message: `Frame ${f.id} has ${f.values.length} values, expected ${layer.width * layer.height}`,
        })
    })
  })
export type OverlayLayer = z.infer<typeof OverlayLayer>
export type PolygonLayer = Extract<OverlayLayer, { kind: 'polygon' }>
export type LineLayer = Extract<OverlayLayer, { kind: 'line' }>
export type ConeLayer = Extract<OverlayLayer, { kind: 'cone' }>
export type PointLayer = Extract<OverlayLayer, { kind: 'point' }>
export type RasterLayer = Extract<OverlayLayer, { kind: 'raster' }>

/** The overlays saved for one map of a project. */
export const MapOverlaySet = z.object({
  mapId: SafeId,
  layers: z.array(OverlayLayer).max(MAX_OVERLAY_LAYERS),
})
export type MapOverlaySet = z.infer<typeof MapOverlaySet>
