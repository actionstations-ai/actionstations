import type { MselRow, Rubric } from '@shared/schemas/scenario'

type Metric = Rubric['metrics'][number]

export const RUBRIC_TOTAL = 100

export const rubricTotal = (metrics: Pick<Metric, 'points'>[]): number =>
  metrics.reduce((n, m) => n + (Number.isFinite(m.points) ? m.points : 0), 0)

/** A warning when the points don't add up to 100, otherwise null. */
export function totalWarning(metrics: Pick<Metric, 'points'>[]): string | null {
  const total = rubricTotal(metrics)
  if (!metrics.length || total === RUBRIC_TOTAL) return null
  const diff = RUBRIC_TOTAL - total
  return `Points add up to ${total}, not ${RUBRIC_TOTAL} (${diff > 0 ? `${diff} short` : `${-diff} over`}).`
}

/** The MSEL row id `input` names (case-insensitive), or null when there is none. */
export function resolveInjectId(input: string, rows: Pick<MselRow, 'id'>[]): string | null {
  const wanted = input.trim().toLowerCase()
  if (!wanted) return null
  return rows.find((r) => r.id.toLowerCase() === wanted)?.id ?? null
}

/** Linked ids that are not MSEL rows (deleted or renamed injects). */
export const unknownInjectIds = (ids: string[], rows: Pick<MselRow, 'id'>[]): string[] =>
  ids.filter((id) => !resolveInjectId(id, rows))

/** Points typed into a cell: a non-negative whole number, or null when not one. */
export function parsePoints(text: string): number | null {
  if (!/^\s*\d+\s*$/.test(text)) return null
  return Number.parseInt(text, 10)
}
