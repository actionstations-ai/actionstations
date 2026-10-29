/**
 * Simulated engagement for social posts (spec 0428 FR-9..11, NFR-5). Pure and integer-valued,
 * so the screen, the export and a re-render agree.
 */
import { EngagementPlan, type EngagementReply } from '../schemas/inject'
import { ENGAGEMENT_FIELDS, metricNames, type EngagementFieldMap } from './engagement-fields'

type Curve = EngagementPlan['curve']

const logistic = (t: number) => 1 / (1 + Math.exp(-8 * (t - 0.5)))
const LOW = logistic(0)
const HIGH = logistic(1)

/**
 * Fraction of the way from start to peak at `t` = minutes / peakAtMin. `steady` goes on past the
 * peak at 10 % of the climb per further `peakAtMin`; the others stay flat.
 */
export function curveFraction(curve: Curve, t: number): number {
  if (t <= 0) return 0
  if (curve === 'steady') return t <= 1 ? t : 1 + 0.1 * (t - 1)
  const c = Math.min(t, 1)
  if (curve === 'fade') return 1 - (1 - c) * (1 - c)
  return (logistic(c) - LOW) / (HIGH - LOW)
}

/** Counts at `minutes` since delivery, rounded down. */
export function engagementAt(plan: EngagementPlan, minutes: number): Record<string, number> {
  const f = curveFraction(plan.curve, Math.max(0, minutes) / plan.peakAtMin)
  const out: Record<string, number> = {}
  for (const name of new Set([...Object.keys(plan.start), ...Object.keys(plan.peak)])) {
    const from = plan.start[name] ?? 0
    const to = plan.peak[name] ?? from
    out[name] = Math.floor(from + (to - from) * f)
  }
  return out
}

/** Replies due by `minutes` since delivery, oldest first. */
export function repliesAt(plan: EngagementPlan, minutes: number): EngagementReply[] {
  return plan.replies.filter((r) => r.atMin <= minutes).sort((a, b) => a.atMin - b.atMin)
}

/** The next reply not yet released, if any. */
export function nextReply(plan: EngagementPlan, minutes: number): EngagementReply | undefined {
  return plan.replies.filter((r) => r.atMin > minutes).sort((a, b) => a.atMin - b.atMin)[0]
}

function setPath(target: Record<string, unknown>, path: string, value: number): void {
  const parts = path.split('.')
  let node = target
  for (const part of parts.slice(0, -1)) {
    const next = node[part]
    node[part] = next && typeof next === 'object' ? { ...(next as object) } : {}
    node = node[part] as Record<string, unknown>
  }
  node[parts[parts.length - 1]!] = value
}

/**
 * A copy of `fields` with the counts for `minutes` since delivery and, where the template has a
 * comment list, the newest released replies. Never mutates its input.
 */
export function applyEngagement(
  fields: Record<string, unknown>,
  plan: EngagementPlan,
  map: EngagementFieldMap,
  minutes: number,
): Record<string, unknown> {
  const out = structuredClone(fields)
  const counts = engagementAt(plan, minutes)
  for (const [metric, path] of Object.entries(map.metrics)) {
    const n = counts[metric]
    if (n !== undefined) setPath(out, path, n)
  }
  if (map.replies) {
    const shown = repliesAt(plan, minutes).slice(-map.replies.max)
    if (shown.length) out[map.replies.field] = shown.map(map.replies.make)
  }
  return out
}

/** Defaults by purpose tag: pressure and misinformation spread fast, the rest build slowly. */
export const defaultCurve = (purposeTag: string): Curve =>
  purposeTag === 'MISINFORMATION' || purposeTag === 'PRESSURE' ? 'surge' : 'steady'

/** The field map for an inject type, or undefined when it has no engagement fields. */
export const fieldMapFor = (type: string): EngagementFieldMap | undefined => ENGAGEMENT_FIELDS[type]

/** Re-render step for the cache file name: one per `refreshMin` exercise minutes. */
export const engagementStep = (minutes: number, refreshMin: number): number =>
  Math.floor(Math.max(0, minutes) / Math.max(1, refreshMin))

/** A new plan with the counts the post already shows as its start. */
export function newPlan(
  type: string,
  fields: Record<string, unknown>,
  purposeTag: string | undefined,
): EngagementPlan {
  const start: Record<string, number> = {}
  for (const name of metricNames(type)) start[name] = 0
  const metrics = (fields.metrics ?? {}) as Record<string, unknown>
  for (const name of Object.keys(start)) {
    const v = metrics[name] ?? fields[name]
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) start[name] = v
  }
  const peak = Object.fromEntries(Object.entries(start).map(([k, v]) => [k, Math.max(v * 20, 100)]))
  return EngagementPlan.parse({
    curve: purposeTag ? defaultCurve(purposeTag) : 'steady',
    start,
    peak,
    peakAtMin: 30,
    replies: [],
  })
}
