// The EAS / SAME header (47 CFR 11.31) and the wording of an EAS crawl, built from fields.
//   ZCZC-ORG-EEE-PSSCCC-PSSCCC+TTTT-JJJHHMM-LLLLLLLL-
import {
  EAS_ORIGINATORS,
  sameEventName,
  type EasOriginator,
} from '../../../shared/alerting/same-events'
import { easClock, parseInstant, sameIssueTime } from './time'

export const MAX_SAME_LOCATIONS = 31

export interface SameInput {
  originator: string
  event: string
  locations: string[]
  purgeMinutes: number
  issued: Date
  station: string
}

/**
 * Purge time +TTTT as HHMM: 15-minute steps up to one hour, 30-minute steps after that, at
 * most six hours. A value between steps rounds up.
 */
export function purgeTime(minutes: number): string {
  const m = Math.min(360, Math.max(15, Math.ceil(Number.isFinite(minutes) ? minutes : 60)))
  const step = m <= 60 ? 15 : 30
  const rounded = Math.min(360, Math.ceil(m / step) * step)
  return `${String(Math.floor(rounded / 60)).padStart(2, '0')}${String(rounded % 60).padStart(2, '0')}`
}

/** Station id: 8 characters, upper case, "/" in place of "-" (the header uses "-" as a separator). */
export function stationId(value: string): string {
  const id = value
    .toUpperCase()
    .replace(/-/g, '/')
    .replace(/[^A-Z0-9/ ]/g, '')
  return id.slice(0, 8).padEnd(8, ' ')
}

export function buildSameHeader(input: SameInput): string {
  const locations = input.locations.filter((l) => /^[0-9]{6}$/.test(l)).slice(0, MAX_SAME_LOCATIONS)
  const where = locations.length ? locations.join('-') : '000000'
  return (
    `ZCZC-${input.originator}-${input.event}-${where}+${purgeTime(input.purgeMinutes)}-` +
    `${sameIssueTime(input.issued)}-${stationId(input.station)}-`
  )
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '')
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

/** The crawl sentence a station's EAS equipment generates, in capitals, marked as an exercise. */
export function crawlSentence(input: {
  originator: string
  event: string
  areas: string[]
  begin: Date
  end: Date
  station: string
  timeZone: string
}): string {
  const who =
    EAS_ORIGINATORS[input.originator as EasOriginator]?.crawl ?? 'A CIVIL AUTHORITY HAS ISSUED'
  const areas = input.areas.length ? ` FOR THE FOLLOWING AREAS: ${input.areas.join('; ')}` : ''
  const times = `BEGINNING AT ${easClock(input.begin, input.timeZone)} AND ENDING AT ${easClock(input.end, input.timeZone)}`
  return (
    `EXERCISE EXERCISE EXERCISE. ${who} A ${sameEventName(input.event)}${areas}; ${times}. ` +
    `MESSAGE FROM ${input.station.trim()}.`
  ).toUpperCase()
}

const iso = (d: Date): string => d.toISOString().replace(/\.\d+Z$/, 'Z')

/** Derived values for an eas_broadcast inject. */
export function deriveEas(fields: Record<string, unknown>): Record<string, unknown> {
  const issued = parseInstant(fields.issued)
  if (!issued) return {}
  const originator = text(fields.originator) || 'CIV'
  const event = text(fields.event) || 'CEM'
  const purgeMinutes = Number(fields.purgeMinutes ?? 60)
  const purge = purgeTime(purgeMinutes)
  const minutes = Number(purge.slice(0, 2)) * 60 + Number(purge.slice(2))
  const end = new Date(issued.getTime() + minutes * 60000)
  const station = text(fields.station) || 'EXERCISE'
  const timeZone = text(fields.timeZone) || 'America/New_York'
  const locations = list(fields.locations)
  return {
    sameHeader: buildSameHeader({ originator, event, locations, purgeMinutes, issued, station }),
    originatorName: EAS_ORIGINATORS[originator as EasOriginator]?.label ?? originator,
    eventName: sameEventName(event),
    purge,
    issuedUtc: iso(issued),
    endUtc: iso(end),
    stationId: stationId(station),
    locationCount: Math.min(locations.length, MAX_SAME_LOCATIONS),
    crawl: crawlSentence({
      originator,
      event,
      areas: list(fields.areaNames),
      begin: issued,
      end,
      station,
      timeZone,
    }),
  }
}
