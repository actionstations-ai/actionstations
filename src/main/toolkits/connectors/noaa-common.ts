// Helpers shared by the NOAA connectors (spec 0455 FR-6): reading the query's options, time
// formats and the one-line citation. Pure; no network.
import type { ConnectorQuery } from './registry'
import { AppError } from '../../lib/errors'

export const DAY_MS = 86_400_000

/** A string option of the query, or the default; refuses a value that does not match `pattern`. */
export function stringOption(
  q: ConnectorQuery,
  key: string,
  pattern: RegExp,
  fallback?: string,
): string {
  const v = q.options[key]
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback
    throw new AppError('VALIDATION', `This source needs the option "${key}"`)
  }
  const s = String(v).trim()
  if (!pattern.test(s)) throw new AppError('VALIDATION', `The option "${key}" is not valid: ${s}`)
  return s
}

/** The period's start and end in milliseconds; refuses an end before the start. */
export function rangeMs(q: ConnectorQuery): { start: number; end: number } {
  const start = Date.parse(q.range.start)
  const end = Date.parse(q.range.end)
  if (!(end > start)) throw new AppError('VALIDATION', 'The end of the period is before its start')
  return { start, end }
}

/** Consecutive windows of at most `days` covering [start, end]. */
export function windows(start: number, end: number, days: number): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = []
  for (let from = start; from < end; from += days * DAY_MS)
    out.push({ from, to: Math.min(end, from + days * DAY_MS) })
  return out
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** "20240901 13:05" in UTC, the date format the CO-OPS API takes. */
export function coopsDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/** "2024-09-01 00:06" (UTC) to an ISO time with a Z. */
export function utcToIso(t: string): string {
  const ms = Date.parse(`${t.trim().replace(' ', 'T')}${t.trim().length === 16 ? ':00' : ''}Z`)
  if (Number.isNaN(ms))
    throw new AppError('PROVIDER', `The archive sent a time this app cannot read: ${t}`)
  return new Date(ms).toISOString()
}

/** A finite number, or undefined for an empty, missing or non-numeric value. */
export function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
