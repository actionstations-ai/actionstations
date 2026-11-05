// Humanitarian gap closure (spec 0469 FR-12): for each coverage gap that opened, how long the
// team took to assign it to a partner and then to confirm it covered, and the share still open at
// the end. Gaps are the `gap_open` ground-truth events (attrs.gap is the gap's label, attrs.sector
// and the event area name it); assignments and confirmations are the team's decisions. The
// targets are the designer's; none is assumed from outside.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  minutesText,
  ms,
  NOT_AVAILABLE,
  ratio,
  ratioText,
  type Metric,
  type MetricOutput,
} from './types'

export const GapClosureConfig = z.object({
  /** Decision kind that assigns a gap to a partner (field "gap"). */
  assignKind: z.string().min(1).default('humanitarian_assign_gap'),
  /** Decision kind that confirms a gap covered (field "gap"). */
  coveredKind: z.string().min(1).default('humanitarian_confirm_gap_covered'),
  /** Hours from the gap opening to assignment that count as on time. */
  assignTargetHours: z.number().positive().default(12),
  /** Hours from the gap opening to confirmed cover that count as on time. */
  coveredTargetHours: z.number().positive().default(48),
})
export type GapClosureConfig = z.infer<typeof GapClosureConfig>

export interface GapClosureInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

const norm = (s: unknown): string =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

interface Gap {
  id: string
  label: string
  area: string
  sector: string
  openedAt: number
}

function gapsOf(events: GroundTruthEvent[]): Gap[] {
  return events
    .filter((e) => e.kind === 'gap_open')
    .map((e) => ({
      id: e.id,
      label: String(e.attrs.gap ?? e.id),
      area: norm(e.area),
      sector: norm(e.attrs.sector),
      openedAt: ms(e.time),
    }))
}

/** A decision names a gap by its label, or by mentioning both its area and its sector. */
function names(g: Gap, text: unknown): boolean {
  const t = norm(text)
  if (!t) return false
  if (t === norm(g.label) || t === norm(g.id)) return true
  return !!g.area && !!g.sector && t.includes(g.area) && t.includes(g.sector)
}

const firstAfter = (g: Gap, ds: MetricDecision[], kind: string): number | null => {
  const times = ds
    .filter((d) => d.kind === kind && names(g, d.fields.gap))
    .map((d) => ms(d.time))
    .sort((a, b) => a - b)
  return times.length ? Math.max(times[0]!, g.openedAt) : null
}

const median = (v: number[]): number | null => {
  if (!v.length) return null
  const s = [...v].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2
}

export function computeGapClosure(i: GapClosureInputs, c: GapClosureConfig): MetricOutput {
  const gaps = gapsOf(i.events)
  const rows = gaps.map((g) => {
    const assigned = firstAfter(g, i.decisions, c.assignKind)
    const covered = firstAfter(g, i.decisions, c.coveredKind)
    return {
      g,
      toAssignMin: assigned === null ? null : (assigned - g.openedAt) / 60_000,
      toCoveredMin: covered === null ? null : (covered - g.openedAt) / 60_000,
    }
  })
  const assigned = rows.filter((r) => r.toAssignMin !== null)
  const covered = rows.filter((r) => r.toCoveredMin !== null)
  const assignOnTime = assigned.filter((r) => r.toAssignMin! <= c.assignTargetHours * 60).length
  const coveredOnTime = covered.filter((r) => r.toCoveredMin! <= c.coveredTargetHours * 60).length
  const open = gaps.length - covered.length
  const openShare = ratio(open, gaps.length)
  return {
    metricId: 'humanitarian_gap_closure',
    title: 'Coordination gaps closed',
    config: c,
    inputs: [
      { label: 'Gaps that opened', value: String(gaps.length) },
      { label: 'Assignment target', value: `${c.assignTargetHours} hours from opening` },
      { label: 'Cover target', value: `${c.coveredTargetHours} hours from opening` },
    ],
    summary: [
      { label: 'Gaps assigned', value: `${assigned.length} of ${gaps.length}` },
      { label: 'Assigned on time', value: String(assignOnTime) },
      { label: 'Gaps confirmed covered', value: `${covered.length} of ${gaps.length}` },
      { label: 'Covered on time', value: String(coveredOnTime) },
      {
        label: 'Open at the end',
        value: openShare === null ? NOT_AVAILABLE : `${open} (${ratioText(openShare)})`,
      },
      {
        label: 'Median time to assign',
        value: minutesText(median(assigned.map((r) => r.toAssignMin!))),
      },
      {
        label: 'Median time to cover',
        value: minutesText(median(covered.map((r) => r.toCoveredMin!))),
      },
    ],
    tables: [
      {
        title: 'Gaps',
        columns: ['Gap', 'Opened', 'To assign', 'To cover', 'Result'],
        rows: rows.map((r) => [
          r.g.label,
          new Date(r.g.openedAt).toISOString(),
          minutesText(r.toAssignMin),
          minutesText(r.toCoveredMin),
          r.toCoveredMin !== null
            ? r.toCoveredMin <= c.coveredTargetHours * 60
              ? 'covered on time'
              : 'covered late'
            : r.toAssignMin !== null
              ? 'assigned, not covered'
              : 'unassigned',
        ]),
      },
    ],
    caveats: [
      'A gap counts as assigned or covered only when a decision names it by its label or by its area and sector.',
      'Gaps are the cells where no partner works in the simulated 3W data; a gap a partner covers by reporting later is not removed.',
    ],
    data: {
      gaps: gaps.length,
      assigned: assigned.length,
      assignedOnTime: assignOnTime,
      covered: covered.length,
      coveredOnTime,
      open,
      openShare,
      medianAssignMin: median(assigned.map((r) => r.toAssignMin!)),
      medianCoverMin: median(covered.map((r) => r.toCoveredMin!)),
    },
  }
}

export const humanitarianGapClosure: Metric<GapClosureConfig, GapClosureInputs> = {
  id: 'humanitarian_gap_closure',
  title: 'Coordination gaps closed',
  configSchema: GapClosureConfig,
  compute: computeGapClosure,
}
