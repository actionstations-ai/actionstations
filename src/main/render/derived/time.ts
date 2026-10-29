// Date helpers for the code-built alert strings. All inputs are ISO 8601 with an offset.

const pad = (n: number, w = 2): string => String(n).padStart(w, '0')

/** A valid Date, or undefined. */
export function parseInstant(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** Day of year (1-366) in UTC. */
export function utcDayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 1)
  return (
    Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 864e5) + 1
  )
}

/** SAME issue time JJJHHMM (day of year, hour, minute) in UTC. */
export function sameIssueTime(d: Date): string {
  return `${pad(utcDayOfYear(d), 3)}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`
}

/** VTEC time YYMMDDTHHMMZ in UTC. */
export function vtecTime(d: Date): string {
  const yy = pad(d.getUTCFullYear() % 100)
  return `${yy}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}Z`
}

/** UGC expiry DDHHMM in UTC. */
export function ugcTime(d: Date): string {
  return `${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`
}

/** CAP forbids "Z": a time ending in Z becomes +00:00. */
export const capTime = (value: string): string => value.replace(/Z$/i, '+00:00')

/** "214 PM EDT Tue Oct 21 2026", the NWS issuance line, in an IANA time zone. */
export function nwsIssuanceLine(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).formatToParts(d)
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? ''
  const clock = `${get('hour')}${get('minute')}`
  return `${clock} ${get('dayPeriod')} ${get('timeZoneName')} ${get('weekday')} ${get('month')} ${get('day')} ${get('year')}`
}

/** "515 PM EDT" in an IANA time zone. */
export function nwsClock(d: Date, timeZone: string): string {
  return nwsIssuanceLine(d, timeZone).split(' ').slice(0, 3).join(' ')
}

/** "02:15 PM" style clock for the EAS crawl, in an IANA time zone. */
export function easClock(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  })
    .format(d)
    .replaceAll('\u202f', ' ')
}
