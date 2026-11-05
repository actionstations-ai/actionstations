// Corrections (spec 0458 FR-9): errors found in the exercise (ground truth), corrections issued
// (decisions), and the time from discovery to correction. A correction answers an error when its
// `error` field names the error's id; otherwise the first unmatched correction after the
// discovery answers it. The channel check compares the correction's channel with the channel the
// error spread on, when the scenario names one.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  attrText,
  decisionsOfKind,
  eventsOfKind,
  fieldText,
  MEDIA_EVENT_KINDS,
  minutesBetween,
} from './media-inputs'
import { mean, minutesText, NOT_AVAILABLE, type Metric, type MetricOutput } from './types'

export const CorrectionsConfig = z.object({
  errorKind: z.string().default(MEDIA_EVENT_KINDS.error),
  decisionKind: z.string().default('issue_correction'),
})
export type CorrectionsConfig = z.infer<typeof CorrectionsConfig>

export interface CorrectionsInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

interface Pair {
  error: GroundTruthEvent
  correction?: MetricDecision
  minutes: number | null
  sameChannel: boolean | null
}

const norm = (s: string) => s.trim().toLowerCase()

function pair(errors: GroundTruthEvent[], corrections: MetricDecision[]): Pair[] {
  const used = new Set<string>()
  return errors.map((error) => {
    const named = corrections.find(
      (c) => !used.has(c.id) && norm(fieldText(c, 'error')) === norm(error.id),
    )
    const after = corrections.find(
      (c) => !used.has(c.id) && !fieldText(c, 'error') && minutesBetween(error.time, c.time) >= 0,
    )
    const correction = named ?? after
    if (correction) used.add(correction.id)
    const channel = attrText(error, 'channel')
    return {
      error,
      ...(correction ? { correction } : {}),
      minutes: correction ? minutesBetween(error.time, correction.time) : null,
      sameChannel:
        correction && channel ? norm(fieldText(correction, 'channel')) === norm(channel) : null,
    }
  })
}

export function computeCorrections(
  inputs: CorrectionsInputs,
  config: CorrectionsConfig,
): MetricOutput {
  const errors = eventsOfKind(inputs.events, config.errorKind)
  const corrections = decisionsOfKind(inputs.decisions, config.decisionKind)
  const pairs = pair(errors, corrections)
  const answered = pairs.filter((p) => p.correction)
  const times = answered.map((p) => p.minutes).filter((m): m is number => m !== null && m >= 0)
  const channelKnown = pairs.filter((p) => p.sameChannel !== null)
  const yesNo = (v: boolean | null) => (v === null ? NOT_AVAILABLE : v ? 'Yes' : 'No')
  return {
    metricId: 'corrections',
    title: 'Corrections',
    config,
    inputs: [
      { label: 'Errors in the scenario', value: String(errors.length) },
      { label: 'Corrections recorded', value: String(corrections.length) },
    ],
    summary: [
      { label: 'Errors corrected', value: `${answered.length} of ${errors.length}` },
      { label: 'Mean time from discovery to correction', value: minutesText(mean(times)) },
      {
        label: 'Corrections on the channel the error spread on',
        value: channelKnown.length
          ? `${channelKnown.filter((p) => p.sameChannel).length} of ${channelKnown.length}`
          : NOT_AVAILABLE,
      },
      { label: 'Errors never corrected', value: String(pairs.length - answered.length) },
    ],
    tables: [
      {
        title: 'Errors and corrections',
        columns: ['Error', 'Found', 'Corrected after', 'Channel', 'Same channel as the error'],
        rows: pairs.map((p) => [
          p.error.id,
          p.error.time,
          minutesText(p.minutes),
          p.correction ? fieldText(p.correction, 'channel') : NOT_AVAILABLE,
          yesNo(p.sameChannel),
        ]),
      },
    ],
    caveats: [
      'Time runs from when the error was discovered in the scenario, not from when the team noticed it.',
      'A correction with no error id is matched to the first unmatched error discovered before it; name the error id to be sure.',
      'Whether a correction was wording-accurate is not scored here; see statement accuracy.',
    ],
    data: {
      errors: errors.length,
      corrected: answered.length,
      meanMinutes: mean(times),
      uncorrected: pairs.length - answered.length,
    },
  }
}

export const corrections: Metric<CorrectionsConfig, CorrectionsInputs> = {
  id: 'corrections',
  title: 'Corrections',
  configSchema: CorrectionsConfig,
  compute: computeCorrections,
}
