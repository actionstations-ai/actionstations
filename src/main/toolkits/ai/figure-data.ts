// Figure data from the AI incident simulation (spec 0467 FR-5): each function turns simulated
// output into the data of one figure kind, so the drawing and the scored case data come from the
// same numbers.
import type { AiDetectorScoresData } from '../../render/figures/ai/detector'
import type { AiPaymentTimelineData } from '../../render/figures/ai/payment'
import type { AiEvalSeriesData, AiModerationQueueData } from '../../render/figures/ai/series'
import {
  binScores,
  type DetectorScores,
  type EvalPoint,
  type PaymentEvent,
  type QueueHour,
} from './simulate'

export function evalSeriesData(
  points: EvalPoint[],
  o: { metric: string; thresholdPct: number; changeDay?: number; title?: string },
): AiEvalSeriesData {
  return {
    ...(o.title ? { title: o.title } : {}),
    metric: o.metric,
    points,
    threshold: { value: o.thresholdPct, label: 'Review threshold' },
    ...(o.changeDay === undefined
      ? {}
      : { changepoint: { x: o.changeDay, label: 'Model update deployed' } }),
    simulated: true,
  }
}

export function queueData(hours: QueueHour[], title?: string): AiModerationQueueData {
  return { ...(title ? { title } : {}), hours, simulated: true }
}

export function detectorData(
  scores: DetectorScores,
  o: { threshold: number; reported?: { score: number; uncertainty: number }; title?: string },
): AiDetectorScoresData {
  return {
    ...(o.title ? { title: o.title } : {}),
    bins: binScores(scores, 10),
    threshold: o.threshold,
    ...(o.reported ? { reported: { ...o.reported, label: 'Item under review' } } : {}),
    simulated: true,
  }
}

export function paymentData(
  events: PaymentEvent[],
  o: { currency?: string; title?: string } = {},
): AiPaymentTimelineData {
  return {
    ...(o.title ? { title: o.title } : {}),
    currency: o.currency ?? 'USD',
    events,
    simulated: true,
  }
}
