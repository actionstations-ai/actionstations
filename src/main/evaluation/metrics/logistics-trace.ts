// Trace completeness and time to trace (spec 0462 FR-11): how long the team took from the start
// signal (the recall signal, or its recall decision) to a submitted ship-to list, how much of the
// real list it found, and whether it said the records had gaps when the scenario planted them.
// The clock is the designer's (24 hours by default, the FSMA 204 records request window); no
// other target is assumed.
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

export const LogisticsTraceConfig = z.object({
  /** Hours the records request allows. */
  clockHours: z.number().positive().default(24),
  /** Start the clock at the recall signal or at the team's recall decision. */
  startFrom: z.enum(['signal', 'recall_decision']).default('signal'),
})
export type LogisticsTraceConfig = z.infer<typeof LogisticsTraceConfig>

export interface LogisticsTraceInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim())
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null
}

function startOf(
  i: LogisticsTraceInputs,
  c: LogisticsTraceConfig,
): { at: string | null; label: string } {
  const signal = i.events.find((e) => e.kind === 'recall_signal')
  if (c.startFrom === 'recall_decision') {
    const d = [...i.decisions]
      .filter((x) => x.kind === 'logistics_declare_recall')
      .sort((a, b) => ms(a.time) - ms(b.time))[0]
    return { at: d?.time ?? null, label: 'the recall decision' }
  }
  return { at: signal?.time ?? null, label: 'the recall signal' }
}

export function computeLogisticsTrace(
  i: LogisticsTraceInputs,
  c: LogisticsTraceConfig,
): MetricOutput {
  const truth = i.events.find((e) => e.kind === 'trace_answer')
  const submitted = [...i.decisions]
    .filter((d) => d.kind === 'logistics_submit_trace_result')
    .sort((a, b) => ms(a.time) - ms(b.time))
  const last = submitted.at(-1)
  const start = startOf(i, c)
  const minutes = last && start.at ? (ms(last.time) - ms(start.at)) / 60_000 : null
  const expected = num(truth?.attrs.accounts)
  const found = num(last?.fields.consignees_found)
  const expectedGaps = num(truth?.attrs.gaps)
  const saidGaps = String(last?.fields.gaps ?? '').trim() !== ''
  const share =
    found !== null && expected !== null ? ratio(Math.min(found, expected), expected) : null
  const withinClock = minutes === null ? null : minutes <= c.clockHours * 60
  return {
    metricId: 'logistics_trace_completeness',
    title: 'Time to trace and trace completeness',
    config: c,
    inputs: [
      { label: 'Clock starts at', value: start.at ? `${start.label}, ${start.at}` : NOT_AVAILABLE },
      { label: 'Clock', value: `${c.clockHours} h (set by the designer)` },
      { label: 'Trace results submitted', value: String(submitted.length) },
      {
        label: 'Accounts in the real list',
        value: expected === null ? NOT_AVAILABLE : String(expected),
      },
    ],
    summary: [
      { label: 'Time to trace', value: minutesText(minutes) },
      {
        label: 'Within the clock',
        value: withinClock === null ? NOT_AVAILABLE : withinClock ? 'yes' : 'no',
      },
      { label: 'Accounts found', value: found === null ? NOT_AVAILABLE : String(found) },
      { label: 'Share of the real list found', value: ratioText(share) },
      {
        label: 'Gaps reported',
        value:
          expectedGaps === null
            ? NOT_AVAILABLE
            : `${saidGaps ? 'yes' : 'no'} (the records have ${expectedGaps})`,
      },
    ],
    tables: [],
    caveats: [
      'The share found counts accounts, not quantities. Accounts found above the real count are not credited.',
      ...(submitted.length === 0 ? ['No trace result was submitted.'] : []),
      ...(submitted.length > 1 ? ['The last submitted result is scored.'] : []),
    ],
    data: { minutes, withinClock, found, expected, share, expectedGaps, saidGaps },
  }
}

export const logisticsTraceCompleteness: Metric<LogisticsTraceConfig, LogisticsTraceInputs> = {
  id: 'logistics_trace_completeness',
  title: 'Time to trace and trace completeness',
  configSchema: LogisticsTraceConfig,
  compute: computeLogisticsTrace,
}
