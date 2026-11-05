// The space weather event finder and storm library (spec 0468 FR-7). The library is a short list of
// well-known storms as pointers to dates, not bundled data: each peak level here was read from
// the NCEI archive's daily indices when this was written, and the archive is fetched only after
// the user agrees. The finder reads Kp points the archive connector returned and groups them
// into storms; the planner turns a storm and a place into the connector queries.
import type { ConnectorQuery } from '../connectors/registry'
import { gLevelOfKp } from '../../render/figures/space/common'
import type { USGS_OBSERVATORIES } from '../connectors/usgs-geomag'

export interface LibraryStorm {
  id: string
  name: string
  /** First and last UTC day of the storm, inclusive. */
  firstDay: string
  lastDay: string
  /** Highest G level reached, from the archive's planetary Kp. */
  peakG: number
  peakKp: number
  note: string
}

export const STORM_LIBRARY: readonly LibraryStorm[] = [
  {
    id: 'may-2024',
    name: 'May 2024 storm',
    firstDay: '2024-05-10',
    lastDay: '2024-05-12',
    peakG: 5,
    peakKp: 9,
    note: 'Planetary Kp reached 9 on 10 and 11 May; the largest storm in more than 20 years.',
  },
  {
    id: 'oct-2024',
    name: 'October 2024 storm',
    firstDay: '2024-10-10',
    lastDay: '2024-10-11',
    peakG: 4,
    peakKp: 8.67,
    note: 'Planetary Kp reached 9- late on 10 October and stayed at 8 on 11 October.',
  },
  {
    id: 'mar-2023',
    name: 'March 2023 storm',
    firstDay: '2023-03-23',
    lastDay: '2023-03-25',
    peakG: 4,
    peakKp: 7.67,
    note: 'Planetary Kp reached 8- on 24 March.',
  },
]

/** The archive covers days from 2011; earlier dates have no files at the host. */
export const ARCHIVE_FIRST_DAY = '2011-01-01'

export interface FoundStorm {
  start: string
  end: string
  peakKp: number
  peakG: number
  peakTime: string
}

/**
 * Storms in a Kp series: runs of intervals at or above the level, joined when less than
 * `gapHours` apart, with the peak of each. `minG` 0 means any interval at Kp 5 or more.
 */
export function findStorms(
  kp: readonly { t: string; v: number }[],
  minG = 1,
  gapHours = 12,
): FoundStorm[] {
  const hot = [...kp]
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
    .filter((p) => gLevelOfKp(p.v) >= Math.max(1, minG))
  const out: FoundStorm[] = []
  for (const p of hot) {
    const last = out.at(-1)
    const t = Date.parse(p.t)
    const pEnd = new Date(t + 3 * 3_600_000).toISOString()
    if (last && t - Date.parse(last.end) < gapHours * 3_600_000) {
      last.end = pEnd
      if (p.v > last.peakKp)
        Object.assign(last, { peakKp: p.v, peakTime: p.t, peakG: gLevelOfKp(p.v) })
    } else out.push({ start: p.t, end: pEnd, peakKp: p.v, peakG: gLevelOfKp(p.v), peakTime: p.t })
  }
  return out
}

/** The USGS observatory nearest a place, by great-circle distance. */
const OBSERVATORY_AT: Record<(typeof USGS_OBSERVATORIES)[number], [number, number]> = {
  BOU: [40.137, -105.237],
  BRW: [71.322, -156.622],
  BSL: [30.35, -89.635],
  CMO: [64.874, -147.86],
  DED: [70.355, -148.793],
  FRD: [38.205, -77.373],
  FRN: [37.091, -119.718],
  GUA: [13.588, 144.867],
  HON: [21.316, -158.0],
  NEW: [48.265, -117.122],
  SHU: [55.348, -160.462],
  SIT: [57.058, -135.325],
  SJG: [18.113, -66.151],
  TUC: [32.174, -110.733],
}

export function nearestObservatory(lat: number, lon: number): { id: string; distanceKm: number } {
  const rad = (d: number) => (d * Math.PI) / 180
  let best = { id: 'BOU', distanceKm: Infinity }
  for (const [id, [la, lo]] of Object.entries(OBSERVATORY_AT)) {
    const a =
      Math.sin(rad(la - lat) / 2) ** 2 +
      Math.cos(rad(lat)) * Math.cos(rad(la)) * Math.sin(rad(lo - lon) / 2) ** 2
    const km = 2 * 6371 * Math.asin(Math.sqrt(a))
    if (km < best.distanceKm) best = { id, distanceKm: Math.round(km) }
  }
  return best
}

export interface StormPlan {
  /** The days the archive is asked for; a day ends at 00 UTC of the next. */
  archive: ConnectorQuery
  /** The ground magnetometer request, when a place was given. */
  geomag?: ConnectorQuery
  /** Products the archive may not have for the dates, said plainly. */
  notes: string[]
}

/**
 * The connector queries for replaying a storm: the archive for its days and, for a place, the
 * nearest USGS observatory's minute values for the same period (at most seven days).
 * The estimate step of each connector then reports what exists; nothing is claimed here.
 */
export function planStorm(
  storm: Pick<LibraryStorm, 'firstDay' | 'lastDay'>,
  place?: { label: string; lat: number; lon: number },
): StormPlan {
  const range = {
    start: `${storm.firstDay}T00:00:00Z`,
    end: new Date(Date.parse(`${storm.lastDay}T00:00:00Z`) + 86_400_000).toISOString(),
  }
  const notes: string[] = []
  if (storm.firstDay < ARCHIVE_FIRST_DAY)
    notes.push(`The NCEI archive has no daily files before ${ARCHIVE_FIRST_DAY}.`)
  const archive: ConnectorQuery = { range, area: { label: 'Planetary' }, options: {} }
  if (!place) return { archive, notes }
  const obs = nearestObservatory(place.lat, place.lon)
  const days = (Date.parse(range.end) - Date.parse(range.start)) / 86_400_000
  if (days > 7)
    notes.push('Minute magnetometer values are limited to seven days; hourly values were chosen.')
  return {
    archive,
    geomag: {
      range,
      area: { label: `${place.label} (nearest observatory ${obs.id}, ${obs.distanceKm} km)` },
      options: { observatory: obs.id, sampling: days > 7 ? 'hour' : 'minute' },
    },
    notes,
  }
}
