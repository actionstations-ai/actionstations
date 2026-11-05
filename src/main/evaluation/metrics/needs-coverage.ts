// Needs coverage (spec 0464 FR-11): the share of recorded needs that were met, and how long each
// took, by category. Needs are ground-truth events (a shelter resident needs electricity for
// equipment); a need is met by a decision of the configured kind that names the same category
// (and, when both name one, the same area). Each decision meets as many needs as its count field
// says (one by default), the earliest unmet need of that category and area first. Shelters use it
// for functional needs support; humanitarian configures it for camp services.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { choiceKey, decisionsOfKind, eventsOfKind, fieldText } from './media-inputs'
import {
  minutesText,
  ms,
  NOT_AVAILABLE,
  ratio,
  sameArea,
  type Metric,
  type MetricOutput,
} from './types'

export const NeedsCoverageConfig = z.object({
  /** Ground-truth event kind that records a need. */
  needEventKind: z.string().min(1).max(80).default('need_recorded'),
  /** Event attribute with the need's category as a label ("label"). */
  categoryAttr: z.string().min(1).max(80).default('label'),
  /** Decision kind that meets needs. */
  decisionKind: z.string().min(1).max(80),
  /** Decision field with the category the decision meets. */
  categoryField: z.string().min(1).max(80).default('need'),
  /** Decision field with how many needs it meets (one when absent). */
  countField: z.string().max(80).default('count'),
  /** Minutes within which a need counts as met promptly. */
  targetMin: z.number().min(0).max(100_000).optional(),
})
export type NeedsCoverageConfig = z.infer<typeof NeedsCoverageConfig>

export interface NeedsCoverageInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

interface Need {
  event: GroundTruthEvent
  category: string
  metAt: number | null
}

function medianOf(values: number[]): number | null {
  if (!values.length) return null
  const v = [...values].sort((a, b) => a - b)
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2
}

function countOf(d: MetricDecision, field: string): number {
  const raw = fieldText(d, field)
  const n = Number(raw)
  return raw !== '' && Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

export function computeNeedsCoverage(
  inputs: NeedsCoverageInputs,
  config: NeedsCoverageConfig,
): MetricOutput {
  const needs: Need[] = eventsOfKind(inputs.events, config.needEventKind).map((event) => {
    const raw = event.attrs[config.categoryAttr]
    return { event, category: typeof raw === 'string' ? raw : 'Other', metAt: null }
  })
  for (const d of decisionsOfKind(inputs.decisions, config.decisionKind)) {
    const key = choiceKey(fieldText(d, config.categoryField))
    let left = countOf(d, config.countField)
    for (const n of needs) {
      if (left === 0) break
      if (n.metAt !== null || choiceKey(n.category) !== key) continue
      if (!sameArea(d.area, n.event.area)) continue
      if (ms(d.time) < ms(n.event.time)) continue
      n.metAt = ms(d.time)
      left--
    }
  }
  const categories = [...new Set(needs.map((n) => n.category))].sort()
  const rows = categories.map((cat) => {
    const mine = needs.filter((n) => n.category === cat)
    const times = mine.flatMap((n) =>
      n.metAt === null ? [] : [(n.metAt - ms(n.event.time)) / 60_000],
    )
    return { cat, recorded: mine.length, met: times.length, times }
  })
  const met = needs.filter((n) => n.metAt !== null)
  const allTimes = met.map((n) => (n.metAt! - ms(n.event.time)) / 60_000)
  const prompt =
    config.targetMin === undefined ? null : allTimes.filter((t) => t <= config.targetMin!).length
  const share = ratio(met.length, needs.length)
  return {
    metricId: 'needs_coverage',
    title: 'Needs coverage',
    config,
    inputs: [
      { label: 'Needs recorded', value: String(needs.length) },
      { label: 'Needs are events of kind', value: config.needEventKind },
      { label: 'Met by decisions of kind', value: config.decisionKind },
      ...(config.targetMin !== undefined
        ? [{ label: 'Prompt target', value: `${config.targetMin} min` }]
        : []),
    ],
    summary: [
      { label: 'Needs met', value: `${met.length} of ${needs.length}` },
      {
        label: 'Share met',
        value: share === null ? NOT_AVAILABLE : `${(share * 100).toFixed(1)}%`,
      },
      { label: 'Median time to meet', value: minutesText(medianOf(allTimes)) },
      ...(prompt !== null
        ? [{ label: 'Met within target', value: `${prompt} of ${needs.length}` }]
        : []),
    ],
    tables: [
      {
        title: 'By category',
        columns: ['Category', 'Recorded', 'Met', 'Open', 'Share met', 'Median time to meet'],
        rows: rows.map((r) => [
          r.cat,
          String(r.recorded),
          String(r.met),
          String(r.recorded - r.met),
          `${Math.round((r.met / r.recorded) * 100)}%`,
          minutesText(medianOf(r.times)),
        ]),
      },
    ],
    caveats: [
      'A decision meets a need only when it names the same category, comes after the need was recorded and, where both name one, is for the same place.',
      'Time to meet is measured on needs that were met; open needs are counted separately.',
      ...(needs.length === 0 ? ['No needs were recorded, so nothing was scored.'] : []),
    ],
    data: {
      recorded: needs.length,
      met: met.length,
      shareMet: share,
      medianMin: medianOf(allTimes),
      byCategory: Object.fromEntries(
        rows.map((r) => [r.cat, { recorded: r.recorded, met: r.met }]),
      ),
    },
  }
}

export const needsCoverage: Metric<NeedsCoverageConfig, NeedsCoverageInputs> = {
  id: 'needs_coverage',
  title: 'Needs coverage',
  configSchema: NeedsCoverageConfig,
  compute: computeNeedsCoverage,
}
