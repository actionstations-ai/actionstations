// NWS P-VTEC and UGC strings (NWSI 10-1703) and the issuance wording of a text product.
//   /O.NEW.KILN.FF.W.0042.261021T1814Z-261021T2115Z/        OHC035-093-212115-
import { nwsClock, nwsIssuanceLine, parseInstant, ugcTime, vtecTime } from './time'

const NO_TIME = '000000T0000Z'
/** Actions whose product still carries the event's begin time. */
const WITH_BEGIN = new Set(['NEW', 'EXA', 'EXB'])

export interface VtecInput {
  action: string
  office: string
  phenomenon: string
  significance: string
  eventNumber: number
  begin?: Date | undefined
  end?: Date | undefined
}

/** "/O.NEW.KILN.FF.W.0042.261021T1814Z-261021T2115Z/"; an unknown end prints 000000T0000Z. */
export function buildVtec(v: VtecInput): string {
  const begin = v.begin && WITH_BEGIN.has(v.action) ? vtecTime(v.begin) : NO_TIME
  const end = v.end ? vtecTime(v.end) : NO_TIME
  const number = String(Math.max(0, Math.trunc(v.eventNumber))).padStart(4, '0')
  return `/O.${v.action}.${v.office}.${v.phenomenon}.${v.significance}.${number}.${begin}-${end}/`
}

/** "OHC035-093-212115-": state, zone type (C county, Z zone), codes, expiry DDHHMM (UTC). */
export function buildUgc(state: string, zoneType: string, codes: string[], expires: Date): string {
  return `${state}${zoneType}${codes.join('-')}-${ugcTime(expires)}-`
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '')
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}

export type NwsKind = 'warning' | 'statement' | 'sps' | 'watch'

export function nwsKind(product: string): NwsKind {
  if (/watch$/i.test(product)) return 'watch'
  if (/special weather statement/i.test(product)) return 'sps'
  if (/statement$/i.test(product)) return 'statement'
  return 'warning'
}

const ACTION_PHRASE: Record<string, string> = {
  CON: 'continues for',
  EXT: 'is extended for',
  EXA: 'is extended to include',
  EXB: 'is extended to include',
  CAN: 'is cancelled for',
  EXP: 'has expired for',
  COR: 'is corrected for',
}

/** Derived values for an nws_weather_warning inject. */
export function deriveNws(fields: Record<string, unknown>): Record<string, unknown> {
  const product = text(fields.product)
  const kind = nwsKind(product)
  const out: Record<string, unknown> = { kind }
  const tz = text(fields.timeZone)
  const issuedAt = parseInstant(fields.issuedAt)
  if (issuedAt && tz) out.issued = nwsIssuanceLine(issuedAt, tz)
  const untilAt = parseInstant(fields.untilAt)
  if (untilAt && tz) out.until = nwsClock(untilAt, tz)
  const v = obj(fields.vtecInfo)
  if (kind !== 'sps' && text(v.office) && text(v.phenomenon)) {
    const action = text(v.action) || 'NEW'
    out.vtec = buildVtec({
      action,
      office: text(v.office),
      phenomenon: text(v.phenomenon),
      significance: text(v.significance) || (kind === 'watch' ? 'A' : 'W'),
      eventNumber: Number(v.eventNumber ?? 1),
      begin: parseInstant(v.begin),
      end: parseInstant(v.end),
    })
    out.action = action
    out.actionPhrase = ACTION_PHRASE[action] ?? ''
  }
  const u = obj(fields.ugcInfo)
  const codes = Array.isArray(u.codes)
    ? u.codes.filter((c): c is string => typeof c === 'string')
    : []
  const expires = parseInstant(u.expires) ?? untilAt
  if (text(u.state) && codes.length && expires)
    out.ugc = buildUgc(text(u.state), text(u.zoneType) || 'C', codes, expires)
  if (kind === 'statement')
    out.warningName = text(fields.warningName) || product.replace(/Statement$/i, 'Warning')
  return out
}
