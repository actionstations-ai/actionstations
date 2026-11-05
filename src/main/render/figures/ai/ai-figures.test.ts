// The AI incidents figure kinds (spec 0467 FR-5): each draws valid, repeatable, accessible SVG
// from simulated data, writes a summary and a data table that agree with the drawing, says it is
// simulated, and refuses bad data. The SVG of each fixture is kept as a file snapshot for review.
import { describe, expect, it } from 'vitest'
import {
  detectorData,
  evalSeriesData,
  paymentData,
  queueData,
} from '../../../toolkits/ai/figure-data'
import {
  detectorScores,
  evaluationSeries,
  paymentTimeline,
  queueVolumes,
} from '../../../toolkits/ai/simulate'
import { listFigureKinds, renderFigure } from '../index'
import { AI_FIGURE_KINDS } from './index'
import { detectorTally, scoreInWords } from './detector'
import { paymentTally } from './payment'

const series = evaluationSeries({
  seed: 5,
  days: 30,
  baseRatePct: 0.6,
  shiftedRatePct: 4.2,
  changeDay: 14,
  rampDays: 5,
  noisePct: 0.25,
})
const scores = detectorScores({
  seed: 9,
  authentic: 400,
  synthetic: 200,
  authenticMean: 0.3,
  syntheticMean: 0.68,
  spread: 0.17,
})
const payments = paymentTimeline({
  seed: 4,
  transfers: 3,
  amountEach: 480_000,
  discoveryMinute: 190,
  holdDelayMinutes: 14,
  settleAfterMinutes: 120,
})

export const FIXTURES: Record<string, unknown> = {
  ai_eval_series: evalSeriesData(series, {
    metric: 'Harmful-output rate on the daily sample',
    thresholdPct: 2,
    changeDay: 14,
    title: 'Customer assistant: harmful-output rate by day',
  }),
  ai_moderation_queue: queueData(
    queueVolumes({
      seed: 2,
      hours: 24,
      basePerHour: 120,
      reviewPerHour: 150,
      surgeStart: 8,
      surgeHours: 6,
      surgeMultiple: 3,
    }),
    'Moderation queue during the spread of the clip',
  ),
  ai_detector_scores: detectorData(scores, {
    threshold: 0.5,
    reported: { score: 0.54, uncertainty: 0.12 },
    title: 'Detector scores for authentic and synthetic video',
  }),
  ai_payment_timeline: paymentData(payments, { title: 'Transfers requested on the video call' }),
  ai_inventory_table: {
    title: 'AI system inventory (excerpt)',
    systems: [
      {
        name: 'Harbor Assist',
        purpose: 'Customer-facing assistant for account questions',
        riskClass: 'limited',
        owner: 'Digital Products',
        vendor: 'Northgate Models',
        status: 'live',
      },
      {
        name: 'CreditLens',
        purpose: 'Scores consumer loan applications',
        riskClass: 'high',
        owner: 'Credit Risk',
        vendor: 'In-house',
        status: 'paused',
      },
      {
        name: 'Doc Summarizer',
        purpose: 'Summarizes internal documents for staff',
        riskClass: 'minimal',
        owner: 'IT Services',
        vendor: 'Northgate Models',
        status: 'pilot',
      },
      {
        name: 'Clip Check',
        purpose: 'Flags suspected synthetic video for review',
        riskClass: 'unclassified',
        owner: 'Trust and Safety',
        vendor: 'In-house',
        status: 'live',
      },
    ],
  },
}

describe('AI incident figure kinds', () => {
  it('registers every kind the toolkit names, once', () => {
    const ids = AI_FIGURE_KINDS.map((k) => k.kind)
    expect(ids).toEqual(Object.keys(FIXTURES))
    for (const id of ids) expect(listFigureKinds()).toContain(id)
  })

  it.each(Object.keys(FIXTURES))('%s draws valid, repeatable, accessible output', async (kind) => {
    const spec = { kind, data: FIXTURES[kind] }
    const a = renderFigure(spec)
    expect(a.svg.startsWith('<svg')).toBe(true)
    expect(a.svg).toContain('role="img"')
    expect(a.svg).toMatch(/<title id="[^"]+">/)
    expect(a.svg).not.toMatch(/<image|<script|href=|onload|data:/)
    expect(a.svg.match(/<svg/g)).toHaveLength(1)
    expect(a.summary.length).toBeGreaterThan(40)
    expect(a.svg).toContain(a.summary.replace(/&/g, '&amp;').slice(0, 40))
    expect(a.table?.rows.length).toBeGreaterThan(0)
    for (const row of a.table!.rows) expect(row).toHaveLength(a.table!.columns.length)
    expect(renderFigure(spec).svg).toBe(a.svg)
    await expect(a.svg).toMatchFileSnapshot(`./__snapshots__/${kind}.svg`)
  })

  it('says simulated in the summary of every kind but the inventory fixture check below', () => {
    for (const kind of Object.keys(FIXTURES))
      expect(renderFigure({ kind, data: FIXTURES[kind] }).summary, kind).toMatch(
        /[Ss]imulated|[Ff]ictional/,
      )
  })

  it('rejects data that does not fit a kind', () => {
    expect(() =>
      renderFigure({ kind: 'ai_eval_series', data: { metric: 'x', points: [] } }),
    ).toThrow(/not valid/)
    const d = FIXTURES.ai_detector_scores as { bins: unknown[]; threshold: number }
    expect(() =>
      renderFigure({ kind: 'ai_detector_scores', data: { ...d, threshold: 0.55 } }),
    ).toThrow(/lower edge of a bin/)
    expect(() =>
      renderFigure({
        kind: 'ai_payment_timeline',
        data: {
          events: [
            { minute: 0, step: 'discovery', amount: 0, detail: 'x' },
            { minute: 5, step: 'settled', amount: 1, detail: 'y' },
          ],
        },
      }),
    ).toThrow(/instruction/)
  })
})

describe('ai_eval_series', () => {
  it('names the first day the rate stays over the threshold, and the changepoint note', () => {
    const { summary, table } = renderFigure({
      kind: 'ai_eval_series',
      data: FIXTURES.ai_eval_series,
    })
    expect(summary).toMatch(/at or above 2% on two days in a row from day (1[4-9]|2\d)/)
    expect(summary).toContain('Model update deployed')
    expect(table!.rows).toHaveLength(30)
  })

  it('says so when the rate never stays over the threshold', () => {
    const flat = evaluationSeries({
      seed: 1,
      days: 10,
      baseRatePct: 0.5,
      shiftedRatePct: 0.5,
      changeDay: 5,
      rampDays: 1,
      noisePct: 0.1,
    })
    const { summary } = renderFigure({
      kind: 'ai_eval_series',
      data: evalSeriesData(flat, { metric: 'Rate', thresholdPct: 2 }),
    })
    expect(summary).toContain('never stays at or above 2%')
  })
})

describe('ai_detector_scores', () => {
  const data = FIXTURES.ai_detector_scores as ReturnType<typeof detectorData>

  it('overlaps the classes, so both kinds of error exist at the threshold', () => {
    const t = detectorTally(data)
    expect(t.falsePositives).toBeGreaterThan(0)
    expect(t.falseNegatives).toBeGreaterThan(0)
    expect(t.authentic).toBe(400)
    expect(t.synthetic).toBe(200)
  })

  it('writes the error counts and the score in words, with its uncertainty', () => {
    const t = detectorTally(data)
    const { summary } = renderFigure({ kind: 'ai_detector_scores', data })
    expect(summary).toContain(`${t.falsePositives} of 400 authentic items flagged`)
    expect(summary).toContain(`${t.falseNegatives} of 200 synthetic items passed`)
    expect(summary).toContain('score 0.54 plus or minus 0.12')
    expect(summary).toContain('within its uncertainty of the threshold')
    expect(summary).toContain('a detector can be wrong')
  })

  it('words a clear score differently from a borderline one', () => {
    expect(scoreInWords(0.95, 0.03, 0.5)).toContain('above the threshold')
    expect(scoreInWords(0.1, 0.03, 0.5)).toContain('leans authentic')
  })
})

describe('ai_payment_timeline', () => {
  it('states the value attempted and the value the hold could still stop', () => {
    const data = paymentData(payments)
    const t = paymentTally(data)
    expect(t.attempted).toBe(3 * 480_000)
    expect(t.attemptedCount).toBe(3)
    expect(t.stoppableCount + Math.round(t.settledBeforeHold / 480_000)).toBe(3)
    expect(t.minutesToHold).toBeGreaterThan(190)
    const { summary } = renderFigure({ kind: 'ai_payment_timeline', data })
    expect(summary).toContain('3 transfers worth 1,440,000 USD were requested')
    expect(summary).toContain('A hold was requested')
  })

  it('says no hold was requested when the team never asked for one', () => {
    const data = paymentData(payments.filter((e) => e.step !== 'hold_requested'))
    expect(renderFigure({ kind: 'ai_payment_timeline', data }).summary).toContain(
      'No hold was requested',
    )
  })
})

describe('ai_inventory_table', () => {
  it('counts systems by risk class and names the paused ones', () => {
    const { summary, table } = renderFigure({
      kind: 'ai_inventory_table',
      data: FIXTURES.ai_inventory_table,
    })
    expect(summary).toContain('4 systems (1 high risk, 1 limited, 1 minimal, 1 unclassified)')
    expect(summary).toContain('Paused: CreditLens')
    expect(table!.columns).toEqual(['System', 'Purpose', 'Risk class', 'Owner', 'Vendor', 'Status'])
  })
})
