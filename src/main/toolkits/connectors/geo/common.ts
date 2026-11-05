// Helpers shared by the earth science replay connectors (spec 0450 FR-9, NFR-1, NFR-2): query
// checks, response parsing, the byte estimates and a small concurrency limit. Everything a user
// types is checked against a fixed shape before it reaches a query string, and no connector
// takes an address from the query: hosts are fixed in each connector.
import { AppError } from '../../../lib/errors'
import type { ConnectorQuery, EstimateItem, FetchContext } from '../registry'

export const DAY_MS = 86_400_000

export const textOf = (data: Uint8Array): string => new TextDecoder().decode(data)

export const isoDay = (iso: string): string => new Date(Date.parse(iso)).toISOString().slice(0, 10)

export const isoSecond = (iso: string): string =>
  new Date(Date.parse(iso)).toISOString().slice(0, 19)

/** Throws unless the period is a real span of at most `maxDays`. */
export function checkRange(q: ConnectorQuery, maxDays: number): number {
  const span = Date.parse(q.range.end) - Date.parse(q.range.start)
  if (!(span >= 0)) throw new AppError('VALIDATION', 'The period ends before it starts')
  if (span > maxDays * DAY_MS)
    throw new AppError('VALIDATION', `Ask for at most ${maxDays} days at a time`)
  return span / DAY_MS
}

export function requireBbox(q: ConnectorQuery): [number, number, number, number] {
  const b = q.area.bbox
  if (!b) throw new AppError('VALIDATION', 'Draw or enter the area (west, south, east, north)')
  const [w, s, e, n] = b
  if (!(e > w) || !(n > s))
    throw new AppError('VALIDATION', 'The area needs east beyond west and north beyond south')
  return b
}

export function numberOption(
  q: ConnectorQuery,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = q.options[key]
  if (raw === undefined || raw === '') return fallback
  const v = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(v) || v < min || v > max)
    throw new AppError('VALIDATION', `${key} must be a number from ${min} to ${max}`)
  return v
}

export function patternOption(
  q: ConnectorQuery,
  key: string,
  re: RegExp,
  what: string,
): string | undefined {
  const raw = q.options[key]
  if (raw === undefined || raw === '') return undefined
  if (typeof raw !== 'string' || !re.test(raw)) throw new AppError('VALIDATION', `Invalid ${what}`)
  return raw
}

export async function getText(ctx: FetchContext, url: string, who: string): Promise<string> {
  const r = await ctx.get(url)
  if (r.status === 204) return ''
  if (r.status !== 200) throw new AppError('INTERNAL', `${who} answered ${r.status}`)
  return textOf(r.data)
}

export async function getJson<T = unknown>(
  ctx: FetchContext,
  url: string,
  who: string,
): Promise<T> {
  const text = await getText(ctx, url, who)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new AppError('INTERNAL', `${who} did not return JSON`)
  }
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export const item = (
  datasetId: string,
  label: string,
  kind: EstimateItem['kind'],
  bytes: number,
): EstimateItem => ({
  datasetId,
  label,
  kind,
  bytes,
})

/** Run `tasks` with at most `limit` in flight at once; results keep the order of the tasks. */
export async function pool<T>(tasks: readonly (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out = new Array<T>(tasks.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < tasks.length) {
      const i = next++
      out[i] = await tasks[i]!()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return out
}

export const jsonFile = (name: string, data: unknown): { name: string; data: string } => ({
  name,
  data: JSON.stringify(data),
})

export interface PointFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] | [number, number, number] }
  properties: Record<string, unknown>
}

export const featureCollection = (
  features: unknown[],
): { type: 'FeatureCollection'; features: unknown[] } => ({
  type: 'FeatureCollection',
  features,
})
