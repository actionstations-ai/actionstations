// NHC best tracks (spec 0449 FR-7, FR-11): a named storm's HURDAT2 best track from the National
// Hurricane Center data archive, as a features dataset (the whole track as a line, and each
// six-hourly fix as a point active until the next one). The forecast cone and advisory files
// are not fetched yet; the best track is what the archive holds for every storm.
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { findStorms, latestHurdatFile, parseHurdat2 } from '../weather/archives'
import {
  type Connector,
  type ConnectorEstimate,
  type ConnectorQuery,
  type ConnectorResult,
} from './registry'

export const NHC_HOST = 'www.nhc.noaa.gov'

const Options = z.object({
  name: z.string().regex(/^[A-Za-z-]{2,20}$/),
  year: z.number().int().min(1851).max(2100),
  basin: z.enum(['atlantic', 'east_pacific']).default('atlantic'),
})

const FILE_BYTES = { atlantic: 6_900_000, east_pacific: 4_000_000 }

function estimate(q: ConnectorQuery): ConnectorEstimate {
  const o = Options.parse(q.options)
  return {
    items: [
      {
        datasetId: `track-${o.name.toLowerCase()}-${o.year}`,
        label: `Best track of ${o.name} ${o.year}`,
        kind: 'features',
        bytes: FILE_BYTES[o.basin],
      },
    ],
    requests: 2,
  }
}

const dirUrl = `https://${NHC_HOST}/data/hurdat/`

async function fetchTrack(
  q: ConnectorQuery,
  ctx: Parameters<Connector['fetch']>[1],
): Promise<ConnectorResult> {
  const o = Options.parse(q.options)
  const listing = new TextDecoder().decode((await ctx.get(dirUrl)).data)
  const file = latestHurdatFile(listing, o.basin)
  if (!file) throw new AppError('NOT_FOUND', 'The archive lists no best-track file for that basin')
  const text = new TextDecoder().decode((await ctx.get(`${dirUrl}${file}`)).data)
  const storm = findStorms(parseHurdat2(text), o)[0]
  if (!storm || !storm.points.length)
    throw new AppError('NOT_FOUND', `The best-track file has no storm named ${o.name} in ${o.year}`)
  const pts = storm.points
  const features = [
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lon, p.lat]) },
      properties: { name: `${storm.name} ${storm.year} best track`, id: storm.id },
    },
    ...pts.map((p, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: {
        name: `${storm.name} ${p.status} ${p.windKt} kt`,
        start: p.time,
        end: pts[i + 1]?.time ?? p.time,
        status: p.status,
        windKt: p.windKt,
        ...(p.pressureMb ? { pressureMb: p.pressureMb } : {}),
      },
    })),
  ]
  const id = `track-${o.name.toLowerCase()}-${o.year}`
  return {
    datasets: [
      {
        id,
        kind: 'features',
        label: `${storm.name} ${storm.year} best track (${storm.id})`,
        file: `${id}.geojson`,
        range: { start: pts[0]!.time, end: pts[pts.length - 1]!.time },
        area: { label: q.area.label },
      },
    ],
    files: [
      { name: `${id}.geojson`, data: JSON.stringify({ type: 'FeatureCollection', features }) },
    ],
    modified: 'One storm taken from the full HURDAT2 file',
    citation: `NOAA National Hurricane Center HURDAT2 (${file}), storm ${storm.id}`,
  }
}

export const nhcConnector: Connector = {
  id: 'nhc-hurdat2',
  label: 'NHC best tracks (HURDAT2)',
  source: 'NOAA National Hurricane Center HURDAT2 best-track archive',
  terms:
    'US government work, public domain. Best tracks are post-storm analyses, not the forecasts issued at the time.',
  hosts: [NHC_HOST],
  estimate,
  fetch: fetchTrack,
}
