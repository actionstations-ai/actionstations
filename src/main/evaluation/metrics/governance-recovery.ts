// Recovery against recovery time objectives (spec 0459 FR-9, FR-10): at each checkpoint hour, how
// many critical functions have been restored within their RTO and how many are past it, and
// whether recovery followed the business impact analysis: a function with a shorter RTO should
// not be restored after one with a longer RTO unless it depends on that function. The recovery
// events come from the simulated incident (or the players' own record entered as events).
import { z } from 'zod'
import type { GroundTruthEvent } from '@shared/schemas/metrics'
import {
  eventsOfKind,
  GOV_EVENT,
  hoursBetween,
  hoursText,
  numberAttr,
  stringsAttr,
} from './governance-inputs'
import { ratio, ratioText, stringList, type Metric, type MetricOutput } from './types'

export const GovRecoveryRtoConfig = z.object({
  /** Checkpoint hours since discovery, as a list or comma-separated text. */
  checkpointHours: stringList.default(['4', '8', '12', '24', '48', '72']),
})
export type GovRecoveryRtoConfig = z.infer<typeof GovRecoveryRtoConfig>

export interface GovRecoveryRtoInputs {
  events: GroundTruthEvent[]
}

interface Fn {
  name: string
  rto: number
  /** Hours since discovery, or null when never recovered. */
  recovered: number | null
  dependsOn: string[]
}

function functionsOf(events: readonly GroundTruthEvent[]): Fn[] {
  const discovered = eventsOfKind(events, GOV_EVENT.discovered)[0]
  const rows = [
    ...eventsOfKind(events, GOV_EVENT.recovered),
    ...eventsOfKind(events, GOV_EVENT.notRecovered),
  ]
  return rows.flatMap((e): Fn[] => {
    const rto = numberAttr(e, 'rtoHours')
    if (rto === null) return []
    const recovered =
      e.kind === GOV_EVENT.notRecovered
        ? null
        : (numberAttr(e, 'recoveredHour') ??
          (discovered ? hoursBetween(discovered.time, e.time) : null))
    return [
      {
        name: e.area ?? String(e.attrs.function ?? e.id),
        rto,
        recovered,
        dependsOn: stringsAttr(e, 'dependsOn'),
      },
    ]
  })
}

/** Names `fn` depends on, directly or through other functions. */
function dependencyClosure(fn: Fn, all: readonly Fn[]): Set<string> {
  const out = new Set<string>()
  const stack = [...fn.dependsOn]
  while (stack.length) {
    const n = stack.pop()!
    if (out.has(n)) continue
    out.add(n)
    stack.push(...(all.find((f) => f.name === n)?.dependsOn ?? []))
  }
  return out
}

/** Pairs recovered against the BIA order that the dependencies do not explain. */
export function orderInversions(fns: readonly Fn[]): [Fn, Fn][] {
  const out: [Fn, Fn][] = []
  for (const a of fns)
    for (const b of fns) {
      if (a === b || a.rto >= b.rto) continue
      const aLater =
        a.recovered === null
          ? b.recovered !== null
          : b.recovered !== null && a.recovered > b.recovered
      if (aLater && !dependencyClosure(a, fns).has(b.name)) out.push([a, b])
    }
  return out
}

const CAVEATS = [
  'RTOs are the designer’s numbers from the business impact analysis, not a standard.',
  'A function that depends on another cannot be restored before it, so those pairs are not counted as order problems.',
]

export function computeGovRecoveryRto(
  inputs: GovRecoveryRtoInputs,
  config: GovRecoveryRtoConfig,
): MetricOutput {
  const fns = functionsOf(inputs.events)
  const checkpoints = config.checkpointHours.map(Number).filter((h) => Number.isFinite(h) && h >= 0)
  const within = (f: Fn): boolean => f.recovered !== null && f.recovered <= f.rto
  const rows = checkpoints.map((h) => {
    const restored = fns.filter((f) => within(f) && f.recovered! <= h).length
    const past = fns.filter((f) => f.rto <= h && !(within(f) && f.recovered! <= h)).length
    return { h, restored, past, share: ratio(restored, fns.length) }
  })
  const inversions = orderInversions(fns)
  const final = fns.filter(within).length
  return {
    metricId: 'gov_recovery_rto',
    title: 'Recovery against RTO',
    config,
    inputs: [
      { label: 'Critical functions', value: String(fns.length) },
      { label: 'Checkpoints (hours since discovery)', value: checkpoints.join(', ') },
    ],
    summary: [
      { label: 'Restored within RTO (final)', value: `${final} of ${fns.length}` },
      {
        label: 'Share restored within RTO (final)',
        value: ratioText(ratio(final, fns.length)),
      },
      {
        label: 'Recovered after RTO',
        value: String(fns.filter((f) => f.recovered !== null && !within(f)).length),
      },
      { label: 'Never recovered', value: String(fns.filter((f) => f.recovered === null).length) },
      { label: 'Order problems (against the BIA)', value: String(inversions.length) },
    ],
    tables: [
      {
        title: 'Functions restored within RTO by hour',
        columns: ['Hour', 'Restored within RTO', 'Past RTO', 'Share restored within RTO'],
        rows: rows.map((r) => [
          String(r.h),
          String(r.restored),
          String(r.past),
          ratioText(r.share),
        ]),
      },
      {
        title: 'Functions',
        columns: ['Function', 'RTO', 'Recovered at', 'Within RTO'],
        rows: fns.map((f) => [
          f.name,
          hoursText(f.rto),
          hoursText(f.recovered),
          within(f) ? 'Yes' : 'No',
        ]),
      },
      {
        title: 'Recovered against the BIA order',
        columns: ['Shorter RTO', 'Restored after', 'Longer RTO'],
        rows: inversions.map(([a, b]) => [a.name, 'restored after', b.name]),
      },
    ],
    caveats: [
      ...CAVEATS,
      ...(fns.length === 0 ? ['No recovery events were found in the case data.'] : []),
    ],
    data: {
      functions: fns.length,
      restoredWithinRto: final,
      orderProblems: inversions.length,
      byHour: Object.fromEntries(rows.map((r) => [r.h, r.share])),
    },
  }
}

export const govRecoveryRto: Metric<GovRecoveryRtoConfig, GovRecoveryRtoInputs> = {
  id: 'gov_recovery_rto',
  title: 'Recovery against RTO',
  configSchema: GovRecoveryRtoConfig,
  compute: computeGovRecoveryRto,
}
