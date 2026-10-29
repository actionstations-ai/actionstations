// Words for the hazard data screens (#439): status text, the hosts, and the privacy statement.
import type { HazardSourceId, HazardSourceResult } from '@shared/schemas'

export const SOURCE_LABEL: Record<HazardSourceId, string> = {
  nws_alerts: 'Weather alerts (National Weather Service)',
  nws_forecast: '7-day forecast (National Weather Service)',
  usgs_recent: 'Recent earthquakes (USGS)',
  usgs_historical: 'Historical earthquakes (USGS)',
  firms: 'Fire detections (NASA FIRMS)',
  openfema: 'Disaster declarations (OpenFEMA)',
  infrastructure: 'Imported infrastructure layer',
}

/** The statement shown before anything is sent. */
export const WHAT_IS_SENT_HAZARDS =
  'When you press Fetch, Action Stations asks the services you tick for public data about your area. It sends rounded coordinates (or state and county codes for FEMA), a request that names the app and its website, and for FIRMS your map key. It sends no project text, documents or names. Nothing is fetched at any other time.'

export const HAZARD_HOSTS_TEXT =
  'api.weather.gov (National Weather Service), earthquake.usgs.gov (US Geological Survey), firms.modaps.eosdis.nasa.gov (NASA FIRMS) and www.fema.gov (OpenFEMA).'

export const NOT_OPERATIONAL =
  'A snapshot is dated data for designing an exercise. It is not a warning and must not be used for operational decisions.'

export const STATUS_TEXT: Record<HazardSourceResult['status'], string> = {
  ok: 'Received',
  empty: 'Nothing found',
  error: 'Failed',
  skipped: 'Not asked',
}

export const STATUS_TONE: Record<
  HazardSourceResult['status'],
  'ok' | 'neutral' | 'error' | 'warn'
> = { ok: 'ok', empty: 'neutral', error: 'error', skipped: 'warn' }

export const formatWhen = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
