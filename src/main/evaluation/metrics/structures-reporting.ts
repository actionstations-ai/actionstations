// Reporting timeliness (spec 0471 FR-10): whether the OSHA report was made inside its clock
// (8 hours for a work-related fatality, 24 hours for an in-patient hospitalization, amputation
// or loss of an eye, 29 CFR 1904.39, a summary) and how soon the owner, insurer and building
// official were told, as entered. The reportable event and its clock are scenario ground truth;
// notices are the team's notify forms. Owner and insurer targets come from the designer, since
// contracts differ; with none set they are shown, not scored.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { minutesText, ms, NOT_AVAILABLE, type Metric, type MetricOutput } from './types'

export const StructuresReportingConfig = z.object({
  notifyKind: z.string().default('structures_notify'),
  /** Hours the owner should be told within, set by the designer; unscored when absent. */
  ownerTargetHours: z.number().positive().optional(),
  insurerTargetHours: z.number().positive().optional(),
})
export type StructuresReportingConfig = z.infer<typeof StructuresReportingConfig>

export interface StructuresReportingInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

const OSHA_HOURS: Record<string, 8 | 24> = {
  'Work-related fatality': 8,
  'In-patient hospitalization': 24,
  Amputation: 24,
  'Loss of an eye': 24,
}

const norm = (v: unknown): string =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

interface Row {
  who: string
  at: string | null
  minutes: number | null
  due: number | null
  verdict: string
}

export function computeStructuresReporting(
  inputs: StructuresReportingInputs,
  config: StructuresReportingConfig,
): MetricOutput {
  const event = [...inputs.events]
    .filter((e) => e.kind === 'reportable_event')
    .sort((a, b) => ms(a.time) - ms(b.time))[0]
  const notices = inputs.decisions.filter((d) => d.kind === config.notifyKind)
  const firstTo = (who: string): MetricDecision | undefined =>
    [...notices]
      .filter((d) => norm(d.fields.who) === who)
      .sort((a, b) => ms(a.time) - ms(b.time))[0]
  const hoursOf = (e: GroundTruthEvent | undefined): number | undefined => {
    if (!e) return undefined
    const stated = Number(e.attrs.clockHours)
    return stated === 8 || stated === 24 ? stated : OSHA_HOURS[String(e.attrs.eventType ?? '')]
  }
  const oshaHours = hoursOf(event)
  const rows: Row[] = [
    ['osha', 'OSHA', oshaHours],
    ['owner', 'Owner', config.ownerTargetHours],
    ['insurer', 'Insurer', config.insurerTargetHours],
    ['building_official', 'Building official', undefined],
  ].map(([key, label, hours]) => {
    const d = firstTo(key as string)
    const minutes = d && event ? (ms(d.time) - ms(event.time)) / 60_000 : null
    const due = typeof hours === 'number' ? hours * 60 : null
    const verdict =
      !d || minutes === null
        ? due === null
          ? 'not told'
          : 'not made'
        : due === null
          ? 'told (no target set)'
          : minutes <= due
            ? 'on time'
            : 'late'
    return { who: label as string, at: d?.time ?? null, minutes, due, verdict }
  })
  const osha = rows[0]!
  return {
    metricId: 'structures_reporting_timeliness',
    title: 'Reporting timeliness',
    config,
    inputs: [
      {
        label: 'Reportable event',
        value: event
          ? `${String(event.attrs.eventType ?? event.kind)} at ${event.time}`
          : NOT_AVAILABLE,
      },
      {
        label: 'OSHA clock',
        value: oshaHours ? `${oshaHours} hours (29 CFR 1904.39, a summary)` : NOT_AVAILABLE,
      },
      { label: 'Notices recorded', value: String(notices.length) },
    ],
    summary: [
      { label: 'OSHA report', value: osha.verdict },
      {
        label: 'Minutes from event to OSHA report',
        value: osha.minutes === null ? NOT_AVAILABLE : minutesText(osha.minutes),
      },
      ...rows.slice(1).map((r) => ({ label: `${r.who} told`, value: r.verdict })),
    ],
    tables: [
      {
        title: 'Notices',
        columns: ['Recipient', 'Told at', 'Minutes after the event', 'Due within (min)', 'Result'],
        rows: rows.map((r) => [
          r.who,
          r.at ?? NOT_AVAILABLE,
          r.minutes === null ? NOT_AVAILABLE : String(Math.round(r.minutes)),
          r.due === null ? NOT_AVAILABLE : String(r.due),
          r.verdict,
        ]),
      },
    ],
    caveats: [
      'The OSHA clocks summarize 29 CFR 1904.39; check the current text. Owner and insurer targets are the designer’s, not a regulation.',
      ...(event ? [] : ['The scenario recorded no reportable event.']),
    ],
    data: { oshaVerdict: osha.verdict, oshaMinutes: osha.minutes },
  }
}

export const structuresReporting: Metric<StructuresReportingConfig, StructuresReportingInputs> = {
  id: 'structures_reporting_timeliness',
  title: 'Reporting timeliness',
  configSchema: StructuresReportingConfig,
  compute: computeStructuresReporting,
}
