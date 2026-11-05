// The metric contract (spec 0448 FR-12): an id, a zod config schema and a pure compute function
// whose result shows the inputs it used. Metrics are app code; a toolkit only names them and
// supplies configuration.
import type { z } from 'zod'
import type { MetricResult } from '@shared/schemas/metrics'

export type MetricOutput = Omit<MetricResult, 'computedAt' | 'sessionId'>

export interface Metric<Config, Inputs> {
  id: string
  title: string
  configSchema: z.ZodType<Config>
  compute(inputs: Inputs, config: Config): MetricOutput
}

export const NOT_AVAILABLE = 'n/a'

export const ms = (iso: string): number => Date.parse(iso)

/** Minutes with one decimal; "n/a" for a missing number. */
export function minutesText(value: number | null): string {
  if (value === null) return NOT_AVAILABLE
  const rounded = Math.round(value * 10) / 10
  return `${rounded} min`
}

/** A ratio, or null when the denominator is zero. */
export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator
}

export function ratioText(value: number | null): string {
  return value === null ? NOT_AVAILABLE : value.toFixed(3)
}

export const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length

const norm = (s: string): string => s.trim().toLowerCase()

/** Two area labels match when either is missing (unconstrained) or they are equal ignoring case. */
export function sameArea(a: string | undefined, b: string | undefined): boolean {
  return a === undefined || b === undefined || norm(a) === norm(b)
}
