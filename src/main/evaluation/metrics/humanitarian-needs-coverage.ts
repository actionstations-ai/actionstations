// Humanitarian needs coverage (spec 0469 FR-12): people reached against the response plan's target,
// by sector and site, from the coverage figures the facilitator records during play (the target
// is entered with each record, never assumed). Sphere indicators are linked references only and
// are not computed here. The latest record for a sector and site counts.
import { z } from 'zod'
import type { MetricDecision } from '@shared/schemas/metrics'
import { NOT_AVAILABLE, ratio, type Metric, type MetricOutput } from './types'

export const NeedsCoverageConfig = z.object({
  /** Decision kind that records coverage (fields sector, site, target, reached). */
  recordKind: z.string().min(1).default('humanitarian_record_coverage'),
  /** Percent of target below which a site is listed as under-covered; 0 lists none. */
  minimumPercent: z.number().min(0).max(100).default(0),
})
export type NeedsCoverageConfig = z.infer<typeof NeedsCoverageConfig>

export interface NeedsCoverageInputs {
  decisions: MetricDecision[]
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null
}
const pct = (v: number | null): string => (v === null ? NOT_AVAILABLE : `${Math.round(v * 100)}%`)

interface Cell {
  sector: string
  site: string
  target: number
  reached: number
}

export function computeNeedsCoverage(i: NeedsCoverageInputs, c: NeedsCoverageConfig): MetricOutput {
  const latest = new Map<string, Cell>()
  const records = i.decisions
    .filter((d) => d.kind === c.recordKind)
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
  for (const d of records) {
    const target = num(d.fields.target)
    const reached = num(d.fields.reached)
    if (target === null || reached === null || target < 0 || reached < 0) continue
    const sector = String(d.fields.sector ?? '').trim()
    const site = String(d.fields.site ?? '').trim()
    if (!sector) continue
    latest.set(`${sector.toLowerCase()}|${site.toLowerCase()}`, { sector, site, target, reached })
  }
  const cells = [...latest.values()]
  const sectors = new Map<string, { target: number; reached: number }>()
  for (const x of cells) {
    const s = sectors.get(x.sector) ?? { target: 0, reached: 0 }
    s.target += x.target
    s.reached += x.reached
    sectors.set(x.sector, s)
  }
  const totalTarget = cells.reduce((s, x) => s + x.target, 0)
  const totalReached = cells.reduce((s, x) => s + x.reached, 0)
  const low = c.minimumPercent
    ? cells.filter((x) => (ratio(x.reached, x.target) ?? 1) * 100 < c.minimumPercent)
    : []
  return {
    metricId: 'humanitarian_needs_coverage',
    title: 'Needs coverage against the response plan',
    config: c,
    inputs: [
      { label: 'Coverage records used', value: String(cells.length) },
      {
        label: 'Minimum coverage listed',
        value: c.minimumPercent ? `${c.minimumPercent}% of target` : 'none set',
      },
    ],
    summary: [
      { label: 'People reached', value: String(totalReached) },
      { label: 'People targeted', value: String(totalTarget) },
      { label: 'Overall coverage', value: pct(ratio(totalReached, totalTarget)) },
      {
        label: 'Sites under the minimum',
        value: c.minimumPercent ? String(low.length) : NOT_AVAILABLE,
      },
    ],
    tables: [
      {
        title: 'By sector',
        columns: ['Sector', 'Reached', 'Target', 'Coverage'],
        rows: [...sectors.entries()].map(([s, v]) => [
          s,
          String(v.reached),
          String(v.target),
          pct(ratio(v.reached, v.target)),
        ]),
      },
      {
        title: 'By sector and site',
        columns: ['Sector', 'Site', 'Reached', 'Target', 'Coverage'],
        rows: cells.map((x) => [
          x.sector,
          x.site || 'n/a',
          String(x.reached),
          String(x.target),
          pct(ratio(x.reached, x.target)),
        ]),
      },
    ],
    caveats: [
      'Targets are the response plan figures the facilitator entered with each record. People targeted is not people in need.',
      'Sphere indicators are referenced for standards and are not computed here.',
    ],
    data: {
      records: cells.length,
      reached: totalReached,
      target: totalTarget,
      coverage: ratio(totalReached, totalTarget),
      underMinimum: low.map((x) => `${x.sector} / ${x.site}`),
    },
  }
}

export const humanitarianNeedsCoverage: Metric<NeedsCoverageConfig, NeedsCoverageInputs> = {
  id: 'humanitarian_needs_coverage',
  title: 'Needs coverage against the response plan',
  configSchema: NeedsCoverageConfig,
  compute: computeNeedsCoverage,
}
