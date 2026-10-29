// Optional public hazard data for scenarios (spec 0439, ADR-0061). A snapshot is dated, normalized
// data saved in the project (hazards/<id>.json); raw responses are never kept. Every string has a
// length cap because the text comes from outside and later goes into prompts.
import { z } from 'zod'
import { IsoDateTime, SafeId } from './common'

export const HazardSourceId = z.enum([
  'nws_alerts',
  'nws_forecast',
  'usgs_recent',
  'usgs_historical',
  'firms',
  'openfema',
  'infrastructure',
])
export type HazardSourceId = z.infer<typeof HazardSourceId>

/** The project's place. Full precision stays here; only the rounded values are ever sent. */
export const ProjectLocation = z.object({
  label: z.string().max(120),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  stateFips: z
    .string()
    .regex(/^\d{2}$/)
    .optional(),
  countyFips: z
    .string()
    .regex(/^\d{3}$/)
    .optional(),
  sendPrecision: z.union([z.literal(0.01), z.literal(0.1)]).default(0.01),
})
export type ProjectLocation = z.infer<typeof ProjectLocation>

const text = (max: number) => z.string().max(max)

export const Quake = z.object({
  id: text(64),
  mag: z.number(),
  place: text(200),
  time: IsoDateTime,
  depthKm: z.number().optional(),
  distanceKm: z.number(),
})
export type Quake = z.infer<typeof Quake>

export const HazardAlert = z.object({
  event: text(120),
  severity: text(40),
  urgency: text(40).optional(),
  headline: text(400),
  effective: text(40),
  expires: text(40).optional(),
  areaDesc: text(400),
})

export const HazardForecastPeriod = z.object({
  name: text(60),
  shortForecast: text(200),
  temperature: z.number().optional(),
  unit: text(4).optional(),
  windSpeed: text(40).optional(),
})

export const HazardDeclaration = z.object({
  disasterNumber: z.number().int(),
  declarationType: text(10),
  declarationDate: text(40),
  incidentType: text(60),
  declarationTitle: text(200),
  designatedArea: text(120),
})

export const HazardFire = z.object({
  days: z.number().int().min(1).max(5),
  count: z.number().int().min(0),
  nearestKm: z.number().optional(),
  detections: z
    .array(
      z.object({
        lat: z.number(),
        lon: z.number(),
        acqDate: text(20),
        confidence: text(20),
        frp: z.number().optional(),
      }),
    )
    .max(500),
})

export const InfrastructureFeature = z.object({
  name: text(160),
  type: text(80).optional(),
  distanceKm: z.number(),
  lat: z.number(),
  lon: z.number(),
})

export const InfrastructureLayer = z.object({
  layer: text(80),
  /** Where the user got the file, as they typed it (for example "HIFLD archive, Hospitals"). */
  source: text(200),
  features: z.array(InfrastructureFeature).max(200),
})
export type InfrastructureLayer = z.infer<typeof InfrastructureLayer>

export const HazardSourceResult = z.object({
  id: HazardSourceId,
  /** The request URL with any key replaced by <MAP_KEY>; absent for imported files. */
  url: text(1000).optional(),
  status: z.enum(['ok', 'empty', 'error', 'skipped']),
  error: text(300).optional(),
  httpStatus: z.number().int().optional(),
  attribution: text(400),
  accessedAt: IsoDateTime,
})
export type HazardSourceResult = z.infer<typeof HazardSourceResult>

export const HazardSnapshot = z.object({
  id: SafeId,
  label: text(80).default(''),
  pinned: z.boolean().default(false),
  fetchedAt: IsoDateTime,
  request: z.object({
    lat: z.number(),
    lon: z.number(),
    precision: z.number(),
    stateFips: z.string().optional(),
    countyFips: z.string().optional(),
  }),
  sources: z.array(HazardSourceResult).max(20).default([]),
  alerts: z.array(HazardAlert).max(50).default([]),
  forecast: z.array(HazardForecastPeriod).max(14).default([]),
  earthquakes: z
    .object({
      recent: z.array(Quake).max(100).default([]),
      historical: z.array(Quake).max(50).default([]),
    })
    .default({ recent: [], historical: [] }),
  fires: HazardFire.optional(),
  declarations: z.array(HazardDeclaration).max(200).default([]),
  infrastructure: z.array(InfrastructureLayer).max(20).default([]),
})
export type HazardSnapshot = z.infer<typeof HazardSnapshot>

export const HazardIndexEntry = z.object({
  id: SafeId,
  label: text(80),
  fetchedAt: IsoDateTime,
  pinned: z.boolean(),
})
export type HazardIndexEntry = z.infer<typeof HazardIndexEntry>

export const HazardIndex = z.object({
  active: SafeId.optional(),
  snapshots: z.array(HazardIndexEntry).max(50).default([]),
})
export type HazardIndex = z.infer<typeof HazardIndex>

/** The exact statement OpenFEMA's terms require wherever its data is shown. */
export const OPENFEMA_STATEMENT =
  "This product uses the Federal Emergency Management Agency's OpenFEMA API, but is not endorsed by FEMA."
export const USGS_CREDIT = 'Credit: U.S. Geological Survey'
export const NWS_CREDIT = 'Source: National Weather Service (weather.gov), open data.'
export const FIRMS_CREDIT = 'Source: NASA FIRMS (VIIRS SNPP near-real-time active fire detections).'

/** Settings → Hazard data. Off until the user turns it on. */
export const HazardSettings = z.object({ enabled: z.boolean().default(false) })
export type HazardSettings = z.infer<typeof HazardSettings>
