// What a fetch would send and to whom (spec 0439 FR-4). Built without any network call; the
// consent dialog shows exactly these lines before the user presses Fetch.
import type { HazardSourceId, ProjectLocation } from '@shared/schemas'
import { skipReason, roundedPoint, type FetchOptions } from './snapshot'
import { clampQuery } from './sources/usgs'

export interface PlanItem {
  id: HazardSourceId
  label: string
  host: string
  /** What leaves the computer, in plain words. */
  sends: string
  /** What comes back. */
  returns: string
  available: boolean
  /** Why the source is greyed out. */
  reason?: string
}

const fmt = (n: number): string => String(n)

/** "41.88, -87.63" at the rounding the user chose. */
export function sentPoint(where: ProjectLocation): string {
  const { lat, lon } = roundedPoint(where)
  const d = where.sendPrecision === 0.1 ? 1 : 2
  return `${lat.toFixed(d)}, ${lon.toFixed(d)}`
}

export function planItems(
  where: ProjectLocation,
  opts: Omit<FetchOptions, 'sources'>,
  hasKey: boolean,
): PlanItem[] {
  const point = `rounded coordinates ${sentPoint(where)}`
  const fips = `state and county codes ${where.stateFips ?? '?'} / ${where.countyFips ?? 'none'}`
  const recent = clampQuery(opts.recent)
  const hist = clampQuery(opts.historical)
  const items: Omit<PlanItem, 'available' | 'reason'>[] = [
    {
      id: 'nws_alerts',
      label: 'Weather alerts',
      host: 'api.weather.gov',
      sends: point,
      returns: 'Active alerts for that point',
    },
    {
      id: 'nws_forecast',
      label: '7-day forecast',
      host: 'api.weather.gov',
      sends: point,
      returns: 'The 12-hour forecast periods',
    },
    {
      id: 'usgs_recent',
      label: 'Recent earthquakes',
      host: 'earthquake.usgs.gov',
      sends: `${point}, radius ${recent.radiusKm} km, magnitude ${fmt(recent.minMagnitude)} or more, last 30 days`,
      returns: 'Up to 100 earthquakes',
    },
    {
      id: 'usgs_historical',
      label: 'Historical earthquakes',
      host: 'earthquake.usgs.gov',
      sends: `${point}, radius ${hist.radiusKm} km, magnitude ${fmt(hist.minMagnitude)} or more, since 1975`,
      returns: 'Up to 50 of the largest earthquakes',
    },
    {
      id: 'firms',
      label: 'Fire detections',
      host: 'firms.modaps.eosdis.nasa.gov',
      sends: `${point} (a box of about 1 degree) and your FIRMS map key`,
      returns: `Satellite fire detections for the last ${opts.firmsDays} day(s)`,
    },
    {
      id: 'openfema',
      label: 'Disaster declarations',
      host: 'www.fema.gov',
      sends: fips,
      returns: 'Up to 200 past declarations, newest first',
    },
  ]
  return items.map((i) => {
    const reason = skipReason(i.id, where, hasKey)
    return { ...i, available: !reason, ...(reason ? { reason } : {}) }
  })
}
