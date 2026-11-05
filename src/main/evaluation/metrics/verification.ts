// Verification before publication (spec 0458 FR-9): for each verification item in the scenario
// (ground truth: authentic, misattributed, manipulated, synthetic, satire or unverifiable), what
// the players decided (hold or publish, with a verdict and a confidence) and whether they asked
// for any provenance check first. Counts published items with a recorded verification step,
// false items published, false items correctly held, and time from receipt to verdict.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  GROUND_TRUTHS,
  isFalseItem,
  verdictIsCorrect,
  VERDICTS,
  type GroundTruth,
  type Verdict,
} from '@shared/toolkits/verification'
import {
  attrText,
  decisionsOfKind,
  eventsOfKind,
  fieldText,
  MEDIA_EVENT_KINDS,
  minutesBetween,
} from './media-inputs'
import {
  mean,
  minutesText,
  NOT_AVAILABLE,
  ms,
  ratio,
  ratioText,
  type Metric,
  type MetricOutput,
} from './types'

export const VerificationConfig = z.object({
  itemKind: z.string().default(MEDIA_EVENT_KINDS.item),
  publishDecisionKind: z.string().default('hold_or_publish'),
  clueDecisionKind: z.string().default('request_clue'),
})
export type VerificationConfig = z.infer<typeof VerificationConfig>

export interface VerificationInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

const norm = (s: string) => s.trim().toLowerCase()
const isTruth = (s: string): s is GroundTruth => (GROUND_TRUTHS as readonly string[]).includes(s)
const isVerdict = (s: string): s is Verdict => (VERDICTS as readonly string[]).includes(s)
const publishes = (action: string) => action === 'Publish' || action === 'Publish with caveat'

export function computeVerification(
  inputs: VerificationInputs,
  config: VerificationConfig,
): MetricOutput {
  const items = eventsOfKind(inputs.events, config.itemKind)
  const calls = decisionsOfKind(inputs.decisions, config.publishDecisionKind)
  const clues = decisionsOfKind(inputs.decisions, config.clueDecisionKind)
  const rows = items.map((item) => {
    const truthText = attrText(item, 'truth')
    const truth = isTruth(truthText) ? truthText : undefined
    const call = calls.find((c) => norm(fieldText(c, 'item')) === norm(item.id))
    const asked = clues.filter(
      (c) =>
        norm(fieldText(c, 'item')) === norm(item.id) &&
        ms(c.time) <= (call ? ms(call.time) : Infinity),
    )
    const verdictText = call ? fieldText(call, 'verdict') : ''
    const verdict = isVerdict(verdictText) ? verdictText : undefined
    const action = call ? fieldText(call, 'action') : ''
    return {
      item,
      truth,
      call,
      asked,
      verdict,
      action,
      minutes: call ? minutesBetween(item.time, call.time) : null,
    }
  })
  const published = rows.filter((r) => publishes(r.action))
  const verifiedFirst = published.filter((r) => r.asked.length > 0 || r.verdict !== undefined)
  const falseRows = rows.filter((r) => r.truth && isFalseItem(r.truth))
  const falsePublished = falseRows.filter((r) => publishes(r.action))
  const falseHeld = falseRows.filter((r) => r.action === 'Hold')
  const times = rows.map((r) => r.minutes).filter((m): m is number => m !== null && m >= 0)
  const correct = rows.filter((r) => r.truth && r.verdict && verdictIsCorrect(r.truth, r.verdict))
  const judged = rows.filter((r) => r.truth && r.verdict)
  const confidentWrong = judged.filter(
    (r) => !verdictIsCorrect(r.truth!, r.verdict!) && fieldText(r.call!, 'confidence') === 'High',
  )
  return {
    metricId: 'verification',
    title: 'Verification before publication',
    config,
    inputs: [
      { label: 'Verification items', value: String(items.length) },
      { label: 'Hold or publish decisions', value: String(calls.length) },
      { label: 'Provenance checks requested', value: String(clues.length) },
    ],
    summary: [
      { label: 'Items published', value: String(published.length) },
      {
        label: 'Published items with a recorded verification step',
        value: published.length
          ? `${verifiedFirst.length} of ${published.length} (${ratioText(ratio(verifiedFirst.length, published.length))})`
          : NOT_AVAILABLE,
      },
      { label: 'False items published', value: `${falsePublished.length} of ${falseRows.length}` },
      { label: 'False items correctly held', value: `${falseHeld.length} of ${falseRows.length}` },
      {
        label: 'Verdicts that matched the ground truth',
        value: judged.length ? `${correct.length} of ${judged.length}` : NOT_AVAILABLE,
      },
      { label: 'Wrong verdicts held with high confidence', value: String(confidentWrong.length) },
      { label: 'Mean time from receipt to verdict', value: minutesText(mean(times)) },
    ],
    tables: [
      {
        title: 'Items',
        columns: [
          'Item',
          'Ground truth',
          'Checks requested',
          'Verdict',
          'Confidence',
          'Action',
          'Minutes to verdict',
        ],
        rows: rows.map((r) => [
          r.item.id,
          r.truth ?? NOT_AVAILABLE,
          String(r.asked.length),
          r.verdict ?? 'No verdict',
          r.call ? fieldText(r.call, 'confidence') || NOT_AVAILABLE : NOT_AVAILABLE,
          r.action || 'No decision',
          minutesText(r.minutes),
        ]),
      },
    ],
    caveats: [
      'Ground truth is hidden from players during the exercise and revealed here; an item with no decision counts as not published and not held.',
      'A recorded verification step means a verdict was recorded or at least one provenance check was requested before the decision.',
      'Unverifiable and satire items are scored by verdict only; the false-item counts cover misattributed, manipulated and synthetic items.',
      'A decision names its item by id in the item field; enter the id from the inject.',
    ],
    data: {
      items: items.length,
      published: published.length,
      publishedWithStep: verifiedFirst.length,
      falsePublished: falsePublished.length,
      falseHeld: falseHeld.length,
      falseItems: falseRows.length,
      verdictsCorrect: correct.length,
      verdictsJudged: judged.length,
      meanMinutesToVerdict: mean(times),
    },
  }
}

export const verification: Metric<VerificationConfig, VerificationInputs> = {
  id: 'verification',
  title: 'Verification before publication',
  configSchema: VerificationConfig,
  compute: computeVerification,
}
