// Small pure helpers shared by the hazard source parsers (spec 0439).
export type Precision = 0.01 | 0.1

/** Round a coordinate to the precision the user chose; this is what leaves the computer. */
export function roundTo(value: number, precision: Precision): number {
  const decimals = precision === 0.1 ? 1 : 2
  return Number((Math.round(value / precision) * precision).toFixed(decimals))
}

const EARTH_KM = 6371.0088

/** Great-circle distance in kilometres. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(bLat - aLat)
  const dLon = rad(bLon - aLon)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Control characters have no place in text that later goes into prompts and documents.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

/** A string cut to `max` characters, or '' when the value is not a string. */
export function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(CONTROL_CHARS, ' ').trim().slice(0, max)
}

export const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

export const oneDecimal = (n: number): number => Math.round(n * 10) / 10

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Parse JSON, or throw a plain message (never the body, which may be large or hostile). */
export function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${what} did not return valid JSON`)
  }
}
