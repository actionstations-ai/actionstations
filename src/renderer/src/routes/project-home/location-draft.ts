// The Location form's text fields and their check (#439), apart from the component so tests can
// reach them.
import type { ProjectLocation } from '@shared/schemas'

export interface Draft {
  label: string
  lat: string
  lon: string
  stateFips: string
  countyFips: string
  precision: '0.01' | '0.1'
}

export const toDraft = (l: ProjectLocation | undefined): Draft => ({
  label: l?.label ?? '',
  lat: l ? String(l.lat) : '',
  lon: l ? String(l.lon) : '',
  stateFips: l?.stateFips ?? '',
  countyFips: l?.countyFips ?? '',
  precision: l?.sendPrecision === 0.1 ? '0.1' : '0.01',
})

/** The location to save, or a message saying what is wrong. */
export function draftToLocation(d: Draft): { value: ProjectLocation } | { error: string } {
  const lat = Number(d.lat)
  const lon = Number(d.lon)
  if (!d.lat.trim() || !Number.isFinite(lat) || Math.abs(lat) > 90)
    return { error: 'Latitude must be a number from -90 to 90.' }
  if (!d.lon.trim() || !Number.isFinite(lon) || Math.abs(lon) > 180)
    return { error: 'Longitude must be a number from -180 to 180.' }
  if (d.stateFips && !/^\d{2}$/.test(d.stateFips)) return { error: 'State code is two digits.' }
  if (d.countyFips && !/^\d{3}$/.test(d.countyFips))
    return { error: 'County code is three digits.' }
  if (d.countyFips && !d.stateFips) return { error: 'A county code needs a state code.' }
  return {
    value: {
      label: d.label.trim().slice(0, 120),
      lat,
      lon,
      ...(d.stateFips ? { stateFips: d.stateFips } : {}),
      ...(d.countyFips ? { countyFips: d.countyFips } : {}),
      sendPrecision: d.precision === '0.1' ? 0.1 : 0.01,
    },
  }
}
