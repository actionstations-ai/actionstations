// wildfire_smoke_map (spec 0461 FR-7): smoke plume polygons in three densities (light, medium,
// heavy, as in the NOAA smoke product), the fire perimeter, and places with their AQI and
// category name, drawn with the shared map overlay code. A moment `at` shows the plumes active
// then. Density is a word in the legend and the data table as well as a pattern and color.
import { z } from 'zod'
import { aqiCategory } from '../../../toolkits/wildfire/lint-air'
import type { OverlayLayer } from '@shared/schemas/map-overlays'
import type { FigureKind } from '../types'
import {
  BASIS_TEXT,
  BasisT,
  IsoTime,
  LonLatT,
  RingT,
  TimeZoneT,
  dayClockIn,
  overlayFigure,
} from './common'

const DENSITY_STYLE = { light: 'info', medium: 'watch', heavy: 'critical' } as const

export const SmokeMapData = z.object({
  title: z.string().max(200).optional(),
  basis: BasisT,
  timeZone: TimeZoneT.default('UTC'),
  at: IsoTime.optional(),
  smoke: z
    .array(
      z.object({
        time: IsoTime,
        density: z.enum(['light', 'medium', 'heavy']),
        ring: RingT,
        /** How long the plume analysis holds, in hours; open-ended when absent. */
        hours: z.number().min(0.25).max(48).optional(),
      }),
    )
    .min(1)
    .max(150),
  perimeter: RingT.optional(),
  places: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        at: LonLatT,
        aqi: z.number().int().min(0).max(500).optional(),
      }),
    )
    .max(20)
    .default([]),
})
export type SmokeMapData = z.infer<typeof SmokeMapData>

const iso = (ms: number): string => new Date(ms).toISOString()

function render(d: SmokeMapData, o: { width: number; height: number }) {
  const tz = d.timeZone
  const layers: OverlayLayer[] = [
    {
      kind: 'polygon',
      id: 'smoke',
      title: 'Smoke plumes',
      legend: { label: 'Smoke density' },
      visible: true,
      opacity: 0.5,
      features: d.smoke.map((s, i) => ({
        id: `smoke-${i}`,
        label: '',
        detail: `${s.density} smoke at ${dayClockIn(s.time, tz)}`,
        time: {
          start: iso(Date.parse(s.time)),
          ...(s.hours ? { end: iso(Date.parse(s.time) + s.hours * 3_600_000) } : {}),
        },
        style: DENSITY_STYLE[s.density],
        legendLabel: `${s.density[0]!.toUpperCase()}${s.density.slice(1)} smoke`,
        rings: [s.ring],
      })),
    },
  ]
  if (d.perimeter)
    layers.push({
      kind: 'polygon',
      id: 'fire',
      title: 'Fire perimeter',
      legend: { label: 'Fire perimeter' },
      visible: true,
      opacity: 0.6,
      features: [
        {
          id: 'perimeter',
          label: 'Fire',
          detail: 'Fire perimeter',
          style: 'neutral' as const,
          rings: [d.perimeter],
        },
      ],
    })
  if (d.places.length)
    layers.push({
      kind: 'point',
      id: 'places',
      title: 'Places',
      legend: { label: 'Place with AQI' },
      visible: true,
      opacity: 0.9,
      features: d.places.map((p, i) => ({
        id: `place-${i}`,
        label: p.aqi === undefined ? p.name : `${p.name}: AQI ${p.aqi} ${aqiCategory(p.aqi)}`,
        detail: p.aqi === undefined ? 'Place' : `AQI ${p.aqi}, ${aqiCategory(p.aqi)}`,
        style: 'info' as const,
        at: p.at,
      })),
    })
  return overlayFigure({
    title: d.title ?? 'Smoke map',
    layers,
    at: d.at ? Date.parse(d.at) : null,
    width: o.width,
    idPrefix: 'smokemap',
    lead: `${d.title ?? 'Smoke map'}. ${BASIS_TEXT[d.basis]}`,
    notes: [],
  })
}

export const smokeMapKind: FigureKind<SmokeMapData> = {
  kind: 'wildfire_smoke_map',
  schema: SmokeMapData,
  render,
  defaultHeight: 540,
}
