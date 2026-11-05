// wildfire_fire_map (spec 0461 FR-7): the fire perimeter over time, hotspots, spread projections,
// evacuation zones colored by status (the status word is in every label and in the legend and
// table), shelters, road closures and assets, drawn with the shared map overlay code. Given a
// moment `at`, only the perimeters and hotspots up to it are shown (the time slider's frame).
import { z } from 'zod'
import type { OverlayLayer } from '@shared/schemas/map-overlays'
import type { FigureKind } from '../types'
import {
  BASIS_TEXT,
  BasisT,
  IsoTime,
  LonLatT,
  PathT,
  RingT,
  ZONE_LOOK,
  ZoneStatusT,
  overlayFigure,
  dayClockIn,
  TimeZoneT,
} from './common'

const Name = z.string().min(1).max(80)

export const FireMapData = z.object({
  title: z.string().max(200).optional(),
  /** Where the fire geometry comes from; stated in the summary and never left out. */
  basis: BasisT,
  /** Time zone for times in labels. */
  timeZone: TimeZoneT.default('UTC'),
  /** A moment to show; later perimeters and hotspots are left off. */
  at: IsoTime.optional(),
  perimeters: z
    .array(
      z.object({
        time: IsoTime,
        acres: z.number().min(0).optional(),
        ring: RingT,
      }),
    )
    .max(48)
    .default([]),
  hotspots: z
    .array(z.object({ time: IsoTime.optional(), at: LonLatT }))
    .max(500)
    .default([]),
  projections: z
    .array(z.object({ hours: z.number().min(1).max(72), ring: RingT }))
    .max(4)
    .default([]),
  zones: z
    .array(
      z.object({
        zone: z.string().min(1).max(40),
        status: ZoneStatusT,
        ring: RingT,
        since: IsoTime.optional(),
        arrival: IsoTime.optional(),
      }),
    )
    .max(40)
    .default([]),
  shelters: z
    .array(z.object({ name: Name, at: LonLatT }))
    .max(20)
    .default([]),
  closures: z
    .array(
      z.object({
        name: Name,
        path: PathT,
        status: z.enum(['Closed', 'Controlled', 'Contraflow']).default('Closed'),
      }),
    )
    .max(30)
    .default([]),
  assets: z
    .array(z.object({ name: Name, at: LonLatT }))
    .max(30)
    .default([]),
})
export type FireMapData = z.infer<typeof FireMapData>

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')

export function fireMapLayers(d: FireMapData): OverlayLayer[] {
  const tz = d.timeZone
  const layers: OverlayLayer[] = []
  if (d.zones.length)
    layers.push({
      kind: 'polygon',
      id: 'zones',
      title: 'Evacuation zones',
      legend: { label: 'Evacuation zone status' },
      visible: true,
      opacity: 0.55,
      features: d.zones.map((z) => ({
        id: `zone-${slug(z.zone)}`,
        label: `${z.zone}: ${z.status}`,
        detail:
          `${z.status}${z.since ? ` since ${dayClockIn(z.since, tz)}` : ''}` +
          `${z.arrival ? `; fire arrival ${dayClockIn(z.arrival, tz)}` : ''}`,
        style: ZONE_LOOK[z.status].token,
        legendLabel: z.status,
        rings: [z.ring],
      })),
    })
  if (d.projections.length)
    layers.push({
      kind: 'polygon',
      id: 'projections',
      title: 'Spread projections',
      legend: { label: 'Spread projection', note: 'Scenario projection, not a prediction' },
      visible: true,
      opacity: 0.35,
      features: d.projections.map((p) => ({
        id: `projection-${p.hours}`,
        label: `${p.hours}-hour projection`,
        detail: `Projected extent after ${p.hours} hours`,
        style: 'watch' as const,
        legendLabel: 'Spread projection',
        rings: [p.ring],
      })),
    })
  if (d.perimeters.length)
    layers.push({
      kind: 'polygon',
      id: 'perimeters',
      title: 'Fire perimeter',
      legend: { label: 'Fire perimeter at a mapped time' },
      visible: true,
      opacity: 0.45,
      features: [...d.perimeters]
        .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
        .map((p, i, all) => ({
          id: `perimeter-${i}`,
          label:
            i === all.length - 1
              ? `${p.acres !== undefined ? `${Math.round(p.acres).toLocaleString('en-US')} acres, ` : ''}${dayClockIn(p.time, tz)}`
              : '',
          detail: `Perimeter at ${dayClockIn(p.time, tz)}${p.acres !== undefined ? `, ${Math.round(p.acres).toLocaleString('en-US')} acres` : ''}`,
          time: { start: new Date(Date.parse(p.time)).toISOString() },
          style: 'critical' as const,
          legendLabel: 'Fire perimeter at a mapped time',
          rings: [p.ring],
        })),
    })
  if (d.hotspots.length)
    layers.push({
      kind: 'point',
      id: 'hotspots',
      title: 'Hotspots',
      legend: { label: 'Satellite hotspot' },
      visible: true,
      opacity: 0.8,
      features: d.hotspots.map((h, i) => ({
        id: `hotspot-${i}`,
        label: '',
        detail: h.time ? `Detected ${dayClockIn(h.time, tz)}` : 'Detection',
        ...(h.time ? { time: { start: new Date(Date.parse(h.time)).toISOString() } } : {}),
        style: 'warning' as const,
        at: h.at,
      })),
    })
  if (d.closures.length)
    layers.push({
      kind: 'line',
      id: 'closures',
      title: 'Road closures',
      legend: { label: 'Road closure or control' },
      visible: true,
      opacity: 0.9,
      track: false,
      features: d.closures.map((c, i) => ({
        id: `closure-${i}`,
        label: `${c.name} (${c.status})`,
        detail: `${c.name}: ${c.status}`,
        style: c.status === 'Closed' ? ('critical' as const) : ('info' as const),
        legendLabel: c.status === 'Closed' ? 'Road closed' : 'Road controlled or contraflow',
        path: c.path,
      })),
    })
  if (d.shelters.length)
    layers.push({
      kind: 'point',
      id: 'shelters',
      title: 'Shelters',
      legend: { label: 'Shelter' },
      visible: true,
      opacity: 0.9,
      features: d.shelters.map((s, i) => ({
        id: `shelter-${i}`,
        label: s.name,
        detail: 'Shelter',
        style: 'ok' as const,
        at: s.at,
      })),
    })
  if (d.assets.length)
    layers.push({
      kind: 'point',
      id: 'assets',
      title: 'Assets',
      legend: { label: 'Asset at risk' },
      visible: true,
      opacity: 0.9,
      features: d.assets.map((s, i) => ({
        id: `asset-${i}`,
        label: s.name,
        detail: 'Asset at risk',
        style: 'info' as const,
        at: s.at,
      })),
    })
  return layers
}

function render(d: FireMapData, o: { width: number; height: number }) {
  const zoneWords = d.zones.length
    ? ` Evacuation zones: ${d.zones.map((z) => `${z.zone} ${z.status.toLowerCase()}`).join('; ')}.`
    : ''
  return overlayFigure({
    title: d.title ?? 'Fire map',
    layers: fireMapLayers(d),
    at: d.at ? Date.parse(d.at) : null,
    width: o.width,
    idPrefix: 'firemap',
    lead: `${d.title ?? 'Fire map'}. ${BASIS_TEXT[d.basis]}`,
    notes: [zoneWords.trim()].filter(Boolean),
  })
}

export const fireMapKind: FigureKind<FireMapData> = {
  kind: 'wildfire_fire_map',
  schema: FireMapData,
  render,
  defaultHeight: 540,
}
