// Hydrograph data from case data (spec 0454 FR-5, FR-9): the figure a scenario shows at a given
// case time, built from a gauge record, the observed series up to that time and the latest
// forecast issued by then (with the one before it, so a revision is visible). Real and simulated
// data go through the same path; the datasets' labels carry which is which.
import { HydrographData } from '../../render/figures/flood/hydrograph'
import type { GaugeRecord } from './events'

export interface TimedSeries {
  t: string
  v: number
}
export interface ForecastIssue {
  issuedAt: string
  points: TimedSeries[]
}

const toRows = (pts: readonly TimedSeries[]) => pts.map((p) => ({ time: p.t, value: p.v }))

export interface HydrographInput {
  gauge: GaugeRecord
  observed: readonly TimedSeries[]
  forecasts?: readonly ForecastIssue[]
  /** Case time shown: later observations and forecasts issued after it are left out. */
  asOf?: string
  title?: string
}

/** The figure data at `asOf` (or the end of the observed series). Throws if nothing is left. */
export function hydrographFromCase(input: HydrographInput): HydrographData {
  const asOf = input.asOf ? Date.parse(input.asOf) : Infinity
  const observed = input.observed.filter((p) => Date.parse(p.t) <= asOf)
  const issued = [...(input.forecasts ?? [])]
    .filter((f) => Date.parse(f.issuedAt) <= asOf)
    .sort((a, b) => Date.parse(a.issuedAt) - Date.parse(b.issuedAt))
  const latest = issued.at(-1)
  const previous = issued.at(-2)
  const g = input.gauge
  const crests = [...g.historicCrests].sort((a, b) => b.stage - a.stage).slice(0, 3)
  return HydrographData.parse({
    ...(input.title ? { title: input.title } : {}),
    gauge: {
      name: g.name,
      id: g.lid,
      ...(g.timeZone ? { timeZone: g.timeZone } : {}),
      unit: 'ft',
    },
    observed: toRows(observed),
    forecast: latest
      ? toRows(latest.points.filter((p) => Date.parse(p.t) >= Date.parse(latest.issuedAt)))
      : [],
    previousForecast: previous ? toRows(previous.points) : [],
    ...(latest ? { issuedAt: latest.issuedAt } : {}),
    categories: g.categories,
    historicCrests: crests.map((c) => ({
      label: `Crest ${c.date.slice(0, 4)}`,
      value: c.stage,
      date: c.date.slice(0, 10),
    })),
  })
}
