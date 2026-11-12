// NEXRAD Level II replay (spec 0449 FR-7, ADR-0095): radar volumes from the NOAA open data
// bucket on AWS, no account. For each exercise frame the connector finds the volume nearest in
// time, fetches only the first part of it with an HTTP range (the lowest tilts, which hold
// reflectivity, correlation coefficient and velocity), decodes it, crops it to the scenario's
// range and stores the radar's own codes as figure frames (one dataset per product).
import { gunzipSync } from 'node:zlib'
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { decodeVolume, type MomentName, type Sweep } from '../weather/nexrad/level2'
import { polarFromSweep } from '../weather/nexrad/polar'
import type { RadarData } from '../../render/figures/weather/radar'
import { findRadarSite, nearestRadarSites } from '../weather/archives'
import { chainFrames, frameCollection, type DatasetSeed } from '../weather/frames'
import {
  type Connector,
  type ConnectorEstimate,
  type ConnectorQuery,
  type ConnectorResult,
} from './registry'

export const NEXRAD_HOST = 'unidata-nexrad-level2.s3.amazonaws.com'
/** Bytes read from the start of each volume: the metadata record and the two lowest cuts. */
export const RANGE_BYTES = 2_000_000
const MAX_FRAMES = 144
const STORED_BYTES_PER_GATE = 0.7

const Options = z.object({
  site: z
    .string()
    .regex(/^[A-Za-z]{4}$/)
    .optional(),
  stepMin: z.number().int().min(1).max(60).default(5),
  extentKm: z.number().min(25).max(460).default(150),
  products: z.string().max(100).default('reflectivity,velocity,correlation_coefficient'),
})

const PRODUCTS = {
  reflectivity: { moment: 'REF' as MomentName, short: 'ref', label: 'reflectivity' },
  velocity: { moment: 'VEL' as MomentName, short: 'vel', label: 'radial velocity' },
  correlation_coefficient: {
    moment: 'RHO' as MomentName,
    short: 'cc',
    label: 'correlation coefficient',
  },
}
type Product = keyof typeof PRODUCTS

function plan(query: ConnectorQuery) {
  const o = Options.parse(query.options)
  const products = o.products
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  for (const p of products)
    if (!(p in PRODUCTS)) throw new AppError('VALIDATION', `Unknown radar product "${p}"`)
  let site = o.site ? findRadarSite(o.site) : undefined
  if (o.site && !site)
    throw new AppError('VALIDATION', `${o.site.toUpperCase()} is not a NEXRAD site`)
  if (!site) {
    const b = query.area.bbox
    if (!b) throw new AppError('VALIDATION', 'Give a radar site or an area to pick one from')
    site = nearestRadarSites((b[1] + b[3]) / 2, (b[0] + b[2]) / 2, 1)[0]!
  }
  const start = Date.parse(query.range.start)
  const end = Date.parse(query.range.end)
  if (!(end > start)) throw new AppError('VALIDATION', 'The period must end after it starts')
  const frames = Math.floor((end - start) / (o.stepMin * 60_000)) + 1
  if (frames > MAX_FRAMES)
    throw new AppError(
      'VALIDATION',
      `That is ${frames} radar frames; the most is ${MAX_FRAMES}. Shorten the period or use a longer step.`,
    )
  return { o, products: products as Product[], site, start, end, frames }
}

const datasetId = (icao: string, p: Product): string =>
  `radar-${icao.toLowerCase()}-${PRODUCTS[p].short}`

function estimate(query: ConnectorQuery): ConnectorEstimate {
  const { o, products, site, frames } = plan(query)
  const stored = Math.round(o.extentKm * 4 * 720 * STORED_BYTES_PER_GATE) * frames
  return {
    items: [
      ...products.map((p) => ({
        datasetId: datasetId(site.icao, p),
        label: `${site.icao} ${PRODUCTS[p].label}, ${frames} frames`,
        kind: 'features' as const,
        bytes: stored,
      })),
      {
        datasetId: 'radar-download',
        label: 'Archive download (cropped before saving)',
        kind: 'features' as const,
        bytes: frames * RANGE_BYTES,
      },
    ],
    requests: frames + Math.ceil((plan(query).end - plan(query).start) / 86_400_000) + 1,
  }
}

interface VolumeKey {
  key: string
  size: number
  timeMs: number
}

const KEY_TIME = /([A-Z0-9]{4})(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_V0\d(\.gz)?$/

export function parseListing(xml: string): VolumeKey[] {
  const out: VolumeKey[] = []
  for (const m of xml.matchAll(/<Contents>([^]*?)<\/Contents>/g)) {
    const key = /<Key>([^<]+)<\/Key>/.exec(m[1]!)?.[1]
    const size = Number(/<Size>(\d+)<\/Size>/.exec(m[1]!)?.[1])
    const t = key ? KEY_TIME.exec(key) : null
    if (!key || !t || !size) continue
    out.push({ key, size, timeMs: Date.UTC(+t[2]!, +t[3]! - 1, +t[4]!, +t[5]!, +t[6]!, +t[7]!) })
  }
  return out.sort((a, b) => a.timeMs - b.timeMs)
}

const pad = (n: number): string => String(n).padStart(2, '0')

function dayPrefixes(site: string, start: number, end: number): string[] {
  const out: string[] = []
  for (
    let d = Date.UTC(
      new Date(start).getUTCFullYear(),
      new Date(start).getUTCMonth(),
      new Date(start).getUTCDate(),
    );
    d <= end;
    d += 86_400_000
  ) {
    const x = new Date(d)
    out.push(`${x.getUTCFullYear()}/${pad(x.getUTCMonth() + 1)}/${pad(x.getUTCDate())}/${site}/`)
  }
  return out
}

/** For each wanted time the nearest volume within one step; a volume is used once. */
export function chooseVolumes(
  volumes: VolumeKey[],
  start: number,
  frames: number,
  stepMs: number,
): VolumeKey[] {
  const chosen = new Map<string, VolumeKey>()
  for (let k = 0; k < frames; k++) {
    const want = start + k * stepMs
    let best: VolumeKey | undefined
    for (const v of volumes)
      if (!best || Math.abs(v.timeMs - want) < Math.abs(best.timeMs - want)) best = v
    if (best && Math.abs(best.timeMs - want) <= stepMs) chosen.set(best.key, best)
  }
  return [...chosen.values()].sort((a, b) => a.timeMs - b.timeMs)
}

function sweepFor(sweeps: Sweep[], moment: MomentName): Sweep | undefined {
  return sweeps.find((s) => s.moments[moment] && !(s.moments[moment]!.codes instanceof Uint16Array))
}

async function fetchFrames(
  query: ConnectorQuery,
  ctx: Parameters<Connector['fetch']>[1],
): Promise<ConnectorResult> {
  const { o, products, site, start, end, frames } = plan(query)
  const base = `https://${NEXRAD_HOST}`
  const volumes: VolumeKey[] = []
  for (const prefix of dayPrefixes(site.icao, start, end)) {
    const res = await ctx.get(`${base}/?list-type=2&prefix=${prefix}&max-keys=1000`)
    volumes.push(...parseListing(new TextDecoder().decode(res.data)))
  }
  const chosen = chooseVolumes(volumes, start, frames, o.stepMin * 60_000)
  if (!chosen.length)
    throw new AppError('NOT_FOUND', `The archive has no ${site.icao} volumes for that period`)
  const perProduct = new Map<Product, { start: string; name: string; data: unknown }[]>(
    products.map((p) => [p, []]),
  )
  for (const v of chosen) {
    const gz = v.key.endsWith('.gz')
    const res = await ctx.get(
      `${base}/${v.key}`,
      gz || v.size <= RANGE_BYTES ? undefined : { range: [0, RANGE_BYTES - 1] },
    )
    const bytes = gz ? new Uint8Array(gunzipSync(res.data)) : res.data
    const volume = decodeVolume(bytes, { maxSweeps: 4 })
    for (const p of products) {
      const sweep = sweepFor(volume.sweeps, PRODUCTS[p].moment)
      const field = sweep && polarFromSweep(sweep, PRODUCTS[p].moment, { maxRangeKm: o.extentKm })
      if (!sweep || !field) continue
      const data: RadarData = {
        origin: 'historical',
        site: {
          id: site.icao,
          name: site.name,
          lat: volume.latitude || site.lat,
          lon: volume.longitude || site.lon,
        },
        product: p,
        time: new Date(sweep.startMs).toISOString(),
        elevationDeg: sweep.elevationDeg,
        extentKm: o.extentKm,
        field,
        overlays: { counties: [], places: [], polygons: [], motions: [] },
      }
      perProduct.get(p)!.push({
        start: data.time,
        name: `${site.icao} ${PRODUCTS[p].label} ${data.time.slice(11, 16)}Z`,
        data,
      })
    }
  }
  const lastEnd = new Date(end).toISOString()
  const datasets: DatasetSeed[] = []
  const files: ConnectorResult['files'] = []
  for (const p of products) {
    const list = chainFrames(perProduct.get(p)!, lastEnd)
    if (!list.length) continue
    const id = datasetId(site.icao, p)
    datasets.push({
      id,
      kind: 'features',
      label: `Radar ${site.icao} ${PRODUCTS[p].label}`,
      file: `${id}.geojson`,
      range: { start: list[0]!.start, end: lastEnd },
      area: {
        label: query.area.label || `${site.name}, ${site.state}`,
        ...(query.area.bbox ? { bbox: query.area.bbox } : {}),
      },
    })
    files.push({ name: `${id}.geojson`, data: frameCollection(list) })
  }
  if (!datasets.length)
    throw new AppError('NOT_FOUND', 'None of the volumes held the requested radar products')
  return {
    datasets,
    files,
    modified: `Cropped to ${o.extentKm} km and the lowest elevation cuts; values are the radar's own codes`,
    citation: `NOAA NEXRAD Level II archive (NOAA Open Data Dissemination), site ${site.icao}`,
  }
}

export const nexradConnector: Connector = {
  id: 'nexrad-level2',
  label: 'NEXRAD Level II radar',
  source: 'NOAA NEXRAD Level II archive on AWS (NOAA Open Data Dissemination)',
  terms:
    'Open use. Data that has been cropped or reprocessed must not be presented as the original archive file.',
  hosts: [NEXRAD_HOST],
  options: [
    {
      key: 'site',
      label: 'Radar site',
      type: 'text',
      help: 'Four-letter NEXRAD radar id, such as KTLX for Oklahoma City, from the NWS radar map; when left empty the radar nearest the centre of the area is used.',
      example: 'KTLX',
    },
    {
      key: 'stepMin',
      label: 'Minutes between frames',
      type: 'number',
      help: 'A whole number from 1 to 60; at most 144 frames are fetched, so long periods need a longer step.',
      default: 5,
      example: 5,
    },
    {
      key: 'extentKm',
      label: 'Range from the radar (km)',
      type: 'number',
      help: 'How far from the radar to keep, 25 to 460 kilometres.',
      default: 150,
      example: 150,
    },
    {
      key: 'products',
      label: 'Radar products',
      type: 'text',
      help: 'Comma-separated list of reflectivity, velocity and correlation_coefficient.',
      default: 'reflectivity,velocity,correlation_coefficient',
      example: 'reflectivity,velocity',
    },
  ],
  area: {
    bbox: 'optional',
    label: 'optional',
    help: 'Draw a box around the storm to pick the nearest radar when no radar site is given; the name is used in the dataset title.',
    example: { label: 'Moore, OK', bbox: [-97.6, 35.25, -97.4, 35.4] },
  },
  exampleRange: { start: '2013-05-20T19:00:00Z', end: '2013-05-20T21:00:00Z' },
  estimate,
  fetch: fetchFrames,
}
