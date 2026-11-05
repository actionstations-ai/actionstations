// Parsers and lookups for the public weather archives (spec 0449 FR-7): the NEXRAD site list,
// SPC filtered storm reports, NHC HURDAT2 best tracks and the NHC directory listing. Pure
// functions over text, so the connectors and the event finder share them and the tests run on
// recorded responses.
import sites from './data/nexrad-sites.json' with { type: 'json' }

export interface RadarSite {
  icao: string
  name: string
  state: string
  lat: number
  lon: number
}

export const RADAR_SITES = sites as RadarSite[]

export const findRadarSite = (icao: string): RadarSite | undefined =>
  RADAR_SITES.find((s) => s.icao === icao.toUpperCase())

/** Great-circle distance in kilometers. */
export function distanceKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

/** The radar sites nearest a place, with the distance to each. */
export function nearestRadarSites(
  lat: number,
  lon: number,
  count = 3,
): (RadarSite & { distanceKm: number })[] {
  return RADAR_SITES.map((s) => ({ ...s, distanceKm: Math.round(distanceKm({ lat, lon }, s)) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, count)
}

// ---- SPC storm reports ----------------------------------------------------------------------

export type ReportKind = 'tornado' | 'wind' | 'hail'

export interface StormReport {
  kind: ReportKind
  /** ISO time, UTC. */
  time: string
  location: string
  county: string
  state: string
  lat: number
  lon: number
  /** F scale, wind speed in mph or hail size in hundredths of an inch, as SPC prints it. */
  magnitude: string
  remarks: string
}

const SECTION: Record<string, ReportKind> = { F_Scale: 'tornado', Speed: 'wind', Size: 'hail' }

/** Split one CSV line into at most `n` fields, the last keeping any commas (comments have them). */
function fields(line: string, n: number): string[] {
  const out: string[] = []
  let rest = line
  while (out.length < n - 1) {
    const at = rest.indexOf(',')
    if (at < 0) break
    out.push(rest.slice(0, at))
    rest = rest.slice(at + 1)
  }
  out.push(rest)
  return out
}

/**
 * Reports of one SPC convective day. `dayIso` is the calendar date (YYYY-MM-DD, UTC) the day
 * begins on at 12 UTC; times before 12 UTC belong to the next calendar date.
 */
export function parseSpcReports(csv: string, dayIso: string): StormReport[] {
  const day = Date.parse(`${dayIso}T00:00:00Z`)
  const out: StormReport[] = []
  let kind: ReportKind | undefined
  for (const line of csv.split(/\r?\n/)) {
    if (!line.trim()) continue
    if (line.startsWith('Time,')) {
      kind = SECTION[line.split(',')[1] ?? '']
      continue
    }
    if (!kind) continue
    const [time, magnitude, location, county, state, lat, lon, remarks] = fields(line, 8)
    if (!/^\d{4}$/.test(time ?? '') || Number.isNaN(Number(lat)) || Number.isNaN(Number(lon)))
      continue
    const hour = Number(time!.slice(0, 2))
    const minute = Number(time!.slice(2))
    const ms = day + ((hour < 12 ? 24 : 0) + hour) * 3_600_000 + minute * 60_000
    out.push({
      kind,
      time: new Date(ms).toISOString(),
      location: location ?? '',
      county: county ?? '',
      state: state ?? '',
      lat: Number(lat),
      lon: Number(lon),
      magnitude: magnitude ?? '',
      remarks: remarks ?? '',
    })
  }
  return out.sort((a, b) => a.time.localeCompare(b.time))
}

/** Counts by kind, for the event finder's one-line description of a day. */
export function summarizeReports(reports: readonly StormReport[]): Record<ReportKind, number> {
  const out: Record<ReportKind, number> = { tornado: 0, wind: 0, hail: 0 }
  for (const r of reports) out[r.kind]++
  return out
}

// ---- NHC HURDAT2 ----------------------------------------------------------------------------

export interface TrackPoint {
  time: string
  status: string
  lat: number
  lon: number
  windKt: number
  /** -999 in the file means unknown. */
  pressureMb: number | undefined
}

export interface Storm {
  id: string
  name: string
  year: number
  points: TrackPoint[]
}

const coord = (s: string): number => {
  const v = Number(s.slice(0, -1))
  return /[SW]$/.test(s) ? -v : v
}

/** Parse a HURDAT2 file: a header line per storm (id, name, count) then one line per fix. */
export function parseHurdat2(text: string): Storm[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const storms: Storm[] = []
  for (let i = 0; i < lines.length;) {
    const head = lines[i]!.split(',').map((s) => s.trim())
    const count = Number(head[2])
    const id = head[0] ?? ''
    if (!/^[A-Z]{2}\d{6}$/.test(id) || !Number.isInteger(count)) {
      i++
      continue
    }
    const points: TrackPoint[] = []
    for (const line of lines.slice(i + 1, i + 1 + count)) {
      const c = line.split(',').map((s) => s.trim())
      const [d, t, , status, lat, lon, wind, pres] = c
      if (!d || !t || !lat || !lon) continue
      points.push({
        time: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2)}:00Z`,
        status: status ?? '',
        lat: coord(lat),
        lon: coord(lon),
        windKt: Number(wind),
        pressureMb: Number(pres) > 0 ? Number(pres) : undefined,
      })
    }
    storms.push({ id, name: head[1] ?? '', year: Number(id.slice(4)), points })
    i += 1 + count
  }
  return storms
}

/** Storms matching a name (case-insensitive) and, when given, a year. */
export function findStorms(storms: readonly Storm[], q: { name?: string; year?: number }): Storm[] {
  return storms.filter(
    (s) =>
      (!q.name || s.name.toLowerCase() === q.name.trim().toLowerCase()) &&
      (q.year === undefined || s.year === q.year),
  )
}

/** The most recently modified HURDAT2 file named in the NHC directory listing. */
export function latestHurdatFile(
  listing: string,
  basin: 'atlantic' | 'east_pacific',
): string | undefined {
  const prefix = basin === 'atlantic' ? 'hurdat2-1851-' : 'hurdat2-nepac-'
  const rows = [
    ...listing.matchAll(/href="(hurdat2-[a-z0-9-]+\.txt)"[^]*?(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/g),
  ]
    .filter((m) => m[1]!.startsWith(prefix))
    .map((m) => ({ file: m[1]!, modified: m[2]! }))
    .sort((a, b) => b.modified.localeCompare(a.modified))
  return rows[0]?.file
}
