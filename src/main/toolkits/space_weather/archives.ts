// Parsers for the space weather archives (spec 0468 FR-6, FR-7): the SWPC message layout, the
// NCEI daily space weather indices file and the daily geomagnetic forecast text. Pure functions
// over text; the connectors do the fetching. These products have changed layout before, so a
// parser returns undefined for a layout it does not recognize instead of guessing.

const KIND_BY_PREFIX: Record<string, 'WATCH' | 'WARNING' | 'ALERT' | 'SUMMARY'> = {
  WAT: 'WATCH',
  WAR: 'WARNING',
  ALT: 'ALERT',
  SUM: 'SUMMARY',
}

export interface ParsedMessage {
  code: string
  serial: string
  kind: 'WATCH' | 'WARNING' | 'ALERT' | 'SUMMARY' | 'OTHER'
  /** The headline line after the kind, such as "Geomagnetic Storm Category G1 Predicted". */
  headline: string
}

/** The code, serial number and headline of a live SWPC message; undefined when it has none. */
export function parseSwpcMessage(message: string): ParsedMessage | undefined {
  const code = /Space Weather Message Code:\s*([A-Z0-9]{6})/.exec(message)?.[1]
  const serial = /Serial Number:\s*(\d+)/.exec(message)?.[1]
  if (!code || !serial) return undefined
  const head =
    /^(?:CONTINUED\s+)?(WATCH|WARNING|ALERT|SUMMARY|EXTENDED WARNING|CANCEL WARNING):\s*(.+)$/m.exec(
      message,
    )
  return {
    code,
    serial,
    kind: KIND_BY_PREFIX[code.slice(0, 3)] ?? 'OTHER',
    headline: head ? head[2]!.trim() : '',
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** ":Issued: 2024 May 11 2205 UTC" to an ISO time; undefined when absent. */
export function parseIssued(text: string): string | undefined {
  const m = /^:Issued:\s*(\d{4}) ([A-Z][a-z]{2}) (\d{1,2}) (\d{2})(\d{2}) UT/m.exec(text)
  const month = m ? MONTHS.indexOf(m[2]!) : -1
  if (!m || month < 0) return undefined
  return new Date(
    Date.UTC(Number(m[1]), month, Number(m[3]), Number(m[4]), Number(m[5])),
  ).toISOString()
}

export interface DailyIndices {
  /** Planetary Kp for the eight three-hour intervals of the day, by interval start. */
  kp: { t: string; v: number }[]
  /** Planetary A index for the day. */
  ap: number
  /** Flares of the day by X-ray class. */
  flares?: { c: number; m: number; x: number }
}

/**
 * The daily indices file (`YYYYMMDDdayind.txt`): the planetary Kp and Ap of the day and the
 * flare counts. `day` is YYYY-MM-DD; undefined when the planetary line is not in the layout.
 */
export function parseDailyIndices(text: string, day: string): DailyIndices | undefined {
  const lines = text.split(/\r?\n/)
  const at = lines.findIndex((l) => l.startsWith(':Geomagnetic_Indices'))
  if (at < 0) return undefined
  const data = lines.slice(at + 1).filter((l) => l.trim() && !l.trim().startsWith('#'))
  // The planetary values share the last line with the College (high latitude) values.
  const planetary = data.at(-1)?.trim().split(/\s+/).map(Number).slice(-9)
  const lastBlock = planetary && planetary.length === 9 && planetary.every(Number.isFinite)
  if (!planetary || !lastBlock) return undefined
  const start = Date.parse(`${day}T00:00:00Z`)
  const kp = planetary.slice(1).map((v, i) => ({
    t: new Date(start + i * 3 * 3_600_000).toISOString(),
    v,
  }))
  if (kp.some((p) => p.v < 0 || p.v > 9)) return undefined
  const rIdx = lines.findIndex((l) => l.startsWith(':Solar_Region_Data'))
  const region =
    rIdx < 0 ? undefined : lines.slice(rIdx + 1).find((l) => l.trim() && !l.trim().startsWith('#'))
  const f = region?.trim().split(/\s+/).map(Number)
  const flares =
    f && f.length >= 8 && f.every(Number.isFinite) ? { c: f[3]!, m: f[4]!, x: f[5]! } : undefined
  return { kp, ap: planetary[0]!, ...(flares ? { flares } : {}) }
}

/** The Kp forecast table of a geomagnetic forecast text; the text itself is kept as written. */
export function hasKpForecast(text: string): boolean {
  return /NOAA Kp index forecast/.test(text) && /00-03UT/.test(text)
}
