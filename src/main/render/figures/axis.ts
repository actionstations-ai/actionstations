// The horizontal axis shared by time series and timelines: values are either numbers (minutes
// from STARTEX, hours, any unit) or ISO 8601 date-time strings (UTC unless an offset is given).
import { scaleLinear, scaleUtc } from 'd3-scale'
import { z } from 'zod'

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'not a date or time')

/** A position along x: a number, or an ISO 8601 date-time string. */
export const XValue = z.union([z.number().finite(), isoDate])
export type XValue = z.infer<typeof XValue>

/** True when every value in the list is the same kind (all numbers or all date strings). */
export function sameXKind(values: XValue[]): boolean {
  return values.every((v) => typeof v === 'number') || values.every((v) => typeof v === 'string')
}

export const toNumber = (v: XValue): number => (typeof v === 'number' ? v : Date.parse(v))

export interface XAxis {
  isTime: boolean
  position: (v: XValue) => number
  ticks: { pos: number; label: string }[]
  /** Text for a value in summaries and tables. */
  label: (v: XValue) => string
}

const pad = (v: number): string => String(v).padStart(2, '0')

/** "2026-03-14 18:05 UTC" for a date string; the number as written otherwise. */
export function xLabel(v: XValue): string {
  if (typeof v === 'number') return String(Math.round(v * 100) / 100)
  const d = new Date(Date.parse(v))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

export function makeXAxis(values: XValue[], r0: number, r1: number, tickCount = 6): XAxis {
  const nums = values.map(toNumber)
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  const span = hi === lo ? [lo - 1, hi + 1] : [lo, hi]
  const isTime = typeof values[0] === 'string'
  if (isTime) {
    const scale = scaleUtc()
      .domain(span.map((v) => new Date(v)))
      .range([r0, r1])
    const fmt = scale.tickFormat(tickCount)
    return {
      isTime,
      position: (v) => scale(new Date(toNumber(v))),
      ticks: scale.ticks(tickCount).map((d) => ({ pos: scale(d), label: fmt(d) })),
      label: xLabel,
    }
  }
  const scale = scaleLinear().domain(span).range([r0, r1])
  const fmt = scale.tickFormat(tickCount)
  return {
    isTime,
    position: (v) => scale(toNumber(v)),
    ticks: scale.ticks(tickCount).map((t) => ({ pos: scale(t), label: fmt(t) })),
    label: xLabel,
  }
}
