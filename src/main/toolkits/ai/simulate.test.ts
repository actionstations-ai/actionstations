// The AI incident simulation (spec 0467 testing): deterministic, the drift changepoint is
// detectable, detector classes overlap so errors exist, and the payment timeline is consistent.
import { describe, expect, it } from 'vitest'
import {
  binScores,
  detectorErrors,
  detectorScores,
  evaluationSeries,
  firstDayAbove,
  paymentTimeline,
  queueVolumes,
  stoppableValue,
} from './simulate'

const drift = {
  seed: 5,
  days: 30,
  baseRatePct: 0.6,
  shiftedRatePct: 4.2,
  changeDay: 14,
  rampDays: 5,
  noisePct: 0.25,
}

describe('evaluation series', () => {
  it('gives the same data for the same seed and different data for another', () => {
    expect(evaluationSeries(drift)).toEqual(evaluationSeries(drift))
    expect(evaluationSeries({ ...drift, seed: 6 })).not.toEqual(evaluationSeries(drift))
  })

  it('stays under the threshold before the change and crosses it soon after', () => {
    const points = evaluationSeries(drift)
    expect(points.slice(0, 14).every((p) => p.y < 2)).toBe(true)
    const day = firstDayAbove(points, 2)
    expect(day).toBeGreaterThanOrEqual(14)
    expect(day).toBeLessThanOrEqual(19)
  })
})

describe('detector scores', () => {
  const scores = detectorScores({
    seed: 9,
    authentic: 400,
    synthetic: 200,
    authenticMean: 0.3,
    syntheticMean: 0.68,
    spread: 0.17,
  })

  it('has overlapping classes, so both error kinds exist at a middle threshold', () => {
    const e = detectorErrors(scores, 0.5)
    expect(e.falsePositives).toBeGreaterThan(0)
    expect(e.falseNegatives).toBeGreaterThan(0)
  })

  it('keeps every score in 0 to 1 and bins them all', () => {
    for (const s of [...scores.authentic, ...scores.synthetic]) {
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
    const bins = binScores(scores)
    expect(bins.reduce((a, b) => a + b.authentic, 0)).toBe(400)
    expect(bins.reduce((a, b) => a + b.synthetic, 0)).toBe(200)
  })
})

describe('moderation queue', () => {
  it('builds a backlog during the surge that the reviewers then work down', () => {
    const hours = queueVolumes({
      seed: 2,
      hours: 24,
      basePerHour: 120,
      reviewPerHour: 150,
      surgeStart: 8,
      surgeHours: 6,
      surgeMultiple: 3,
    })
    const peak = Math.max(...hours.map((h) => h.backlog))
    expect(hours[7]!.backlog).toBe(0)
    expect(peak).toBeGreaterThan(500)
    expect(hours[23]!.backlog).toBeLessThan(peak)
    for (const h of hours) expect(h.reviewed).toBeLessThanOrEqual(150)
  })
})

describe('payment timeline', () => {
  const events = paymentTimeline({
    seed: 4,
    transfers: 3,
    amountEach: 480_000,
    discoveryMinute: 190,
    holdDelayMinutes: 14,
    settleAfterMinutes: 120,
  })

  it('lists instruction, approval, release and settlement per transfer, then the response', () => {
    for (const step of ['instruction', 'approval', 'release', 'settled'])
      expect(events.filter((e) => e.step === step)).toHaveLength(3)
    expect(events.map((e) => e.minute)).toEqual(
      [...events.map((e) => e.minute)].sort((a, b) => a - b),
    )
    expect(events.some((e) => e.step === 'recall_sent')).toBe(true)
  })

  it('counts what the hold could still stop: transfers released but not yet settled', () => {
    const open = stoppableValue(events)
    expect(open.count).toBe(1)
    expect(open.value).toBe(480_000)
    expect(stoppableValue(events.filter((e) => e.step !== 'hold_requested'))).toEqual({
      count: 0,
      value: 0,
    })
  })
})
