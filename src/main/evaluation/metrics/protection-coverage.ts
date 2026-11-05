// Protection coverage (spec 0455 FR-9): the share of the sensitive areas the modeled oil
// reaches that had a protective action before it arrived. A zone is a sensitive area with a
// modeled series (oil presence or thickness over time); its landfall is the first time the series
// reaches the threshold. It counts as protected when a decision of one of the listed kinds
// (protective boom, intake closure, wildlife hazing, a closure order) names that area and was
// made at least `clearanceMin` minutes before landfall. Areas the oil never reaches are left out.
// A decision with no area protects nothing here: protection is a place, so the place must be named.
import { z } from 'zod'
import type { MetricDecision, ModeledSeries } from '@shared/schemas/metrics'
import { crossingTime } from './threshold-timing'
import {
  minutesText,
  ms,
  NOT_AVAILABLE,
  ratio,
  stringList,
  type Metric,
  type MetricOutput,
} from './types'

export const ProtectionCoverageConfig = z.object({
  /** Decision kinds that count as a protective strategy for an area. */
  actionKinds: stringList
    .refine((l) => l.length > 0, 'name at least one decision kind')
    .default(['deploy_protective_boom', 'close_water_intake', 'close_fishery_or_shoreline']),
  /** The series value at which the oil counts as having arrived. */
  threshold: z.number().default(1),
  /** Minutes the protection needs to be in place before landfall (boom deployment time). */
  clearanceMin: z.number().min(0).default(0),
})
export type ProtectionCoverageConfig = z.infer<typeof ProtectionCoverageConfig>

export interface ProtectionCoverageInputs {
  series: ModeledSeries[]
  decisions: MetricDecision[]
}

const norm = (s: string): string => s.trim().toLowerCase()
const iso = (t: number | null): string => (t === null ? '' : new Date(t).toISOString())

type Status = 'protected' | 'late' | 'unprotected'
const STATUS_TEXT: Record<Status, string> = {
  protected: 'Protected in time',
  late: 'Protected too late',
  unprotected: 'No protective action',
}

interface Row {
  zone: string
  landfall: number
  needBy: number
  action: number | null
  kind: string
  status: Status
}

function rowFor(
  s: ModeledSeries,
  decisions: MetricDecision[],
  c: ProtectionCoverageConfig,
): Row | null {
  const landfall = crossingTime(s, c.threshold)
  if (landfall === null) return null
  const needBy = landfall - c.clearanceMin * 60_000
  const mine = decisions
    .filter(
      (d) =>
        c.actionKinds.includes(d.kind) && d.area !== undefined && norm(d.area) === norm(s.zone),
    )
    .sort((a, b) => ms(a.time) - ms(b.time))
  const first = mine[0]
  const action = first ? ms(first.time) : null
  const status: Status = action === null ? 'unprotected' : action <= needBy ? 'protected' : 'late'
  return { zone: s.zone, landfall, needBy, action, kind: first?.kind ?? '', status }
}

export function computeProtectionCoverage(
  inputs: ProtectionCoverageInputs,
  config: ProtectionCoverageConfig,
): MetricOutput {
  const rows = inputs.series.flatMap((s) => rowFor(s, inputs.decisions, config) ?? [])
  const total = rows.length
  const count = (st: Status) => rows.filter((r) => r.status === st).length
  const share = ratio(count('protected'), total)
  const percent = share === null ? NOT_AVAILABLE : `${Math.round(share * 100)}%`
  return {
    metricId: 'protection_coverage',
    title: 'Protection coverage',
    config,
    inputs: [
      { label: 'Sensitive areas modeled', value: String(inputs.series.length) },
      { label: 'Areas the oil reaches', value: String(total) },
      { label: 'Protective decision kinds', value: config.actionKinds.join(', ') },
      { label: 'Protection needed before landfall', value: minutesText(config.clearanceMin) },
    ],
    summary: [
      { label: 'Protected in time', value: `${count('protected')} of ${total} (${percent})` },
      { label: 'Protected too late', value: String(count('late')) },
      { label: 'No protective action', value: String(count('unprotected')) },
    ],
    tables: [
      {
        title: 'Sensitive areas',
        columns: [
          'Area',
          'Landfall (modeled)',
          'Needed by',
          'First protective action',
          'Kind',
          'Result',
        ],
        rows: rows.map((r) => [
          r.zone,
          iso(r.landfall),
          iso(r.needBy),
          iso(r.action),
          r.kind,
          STATUS_TEXT[r.status],
        ]),
      },
    ],
    caveats: [
      'Landfall comes from the modeled series, interpolated between samples; it is only as good as the trajectory behind it.',
      'A decision counts for an area only when it names that area.',
      ...(total === 0 ? ['The modeled oil reached none of the areas, so nothing was scored.'] : []),
    ],
    data: {
      share,
      protected: count('protected'),
      late: count('late'),
      unprotected: count('unprotected'),
      zones: Object.fromEntries(
        rows.map((r) => [
          r.zone,
          { status: r.status, landfall: iso(r.landfall), action: iso(r.action) || null },
        ]),
      ),
    },
  }
}

export const protectionCoverage: Metric<ProtectionCoverageConfig, ProtectionCoverageInputs> = {
  id: 'protection_coverage',
  title: 'Protection coverage',
  configSchema: ProtectionCoverageConfig,
  compute: computeProtectionCoverage,
}
