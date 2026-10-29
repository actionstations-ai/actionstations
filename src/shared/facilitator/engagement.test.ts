import { describe, expect, it } from 'vitest'
import { EngagementPlan } from '../schemas/inject'
import {
  applyEngagement,
  curveFraction,
  defaultCurve,
  engagementAt,
  engagementStep,
  nextReply,
  repliesAt,
} from './engagement'
import { ENGAGEMENT_FIELDS } from './engagement-fields'

const plan = (over: Partial<EngagementPlan> = {}): EngagementPlan =>
  EngagementPlan.parse({
    curve: 'steady',
    start: { likes: 100, reposts: 10 },
    peak: { likes: 1100, reposts: 210 },
    peakAtMin: 20,
    replies: [
      { id: 'r2', atMin: 10, author: 'Sam', text: 'Second' },
      { id: 'r1', atMin: 3, author: 'Jo', handle: '@jo', text: 'First' },
    ],
    ...over,
  })

describe('curveFraction (spec 0428 §3)', () => {
  it.each(['surge', 'steady', 'fade'] as const)('%s starts at 0 and reaches 1 at the peak', (c) => {
    expect(curveFraction(c, 0)).toBe(0)
    expect(curveFraction(c, 1)).toBeCloseTo(1, 10)
  })
  it('surge is slow at first, fast in the middle', () => {
    expect(curveFraction('surge', 0.2)).toBeLessThan(0.2)
    expect(curveFraction('surge', 0.5)).toBeCloseTo(0.5, 5)
  })
  it('fade climbs fast at first', () => {
    expect(curveFraction('fade', 0.2)).toBeGreaterThan(0.2)
  })
  it('steady keeps growing 10 percent per further peak time, the others stay flat', () => {
    expect(curveFraction('steady', 2)).toBeCloseTo(1.1)
    expect(curveFraction('surge', 5)).toBeCloseTo(1, 10)
    expect(curveFraction('fade', 5)).toBe(1)
  })
})

describe('engagementAt', () => {
  it('gives the start counts at delivery and whole numbers always', () => {
    expect(engagementAt(plan(), 0)).toEqual({ likes: 100, reposts: 10 })
    for (const c of ['surge', 'steady', 'fade'] as const)
      for (let m = 0; m < 60; m += 3)
        for (const n of Object.values(engagementAt(plan({ curve: c }), m)))
          expect(Number.isInteger(n)).toBe(true)
  })
  it('reaches the peak at peakAtMin', () => {
    expect(engagementAt(plan(), 20)).toEqual({ likes: 1100, reposts: 210 })
  })
  it('never goes down on the way to the peak', () => {
    for (const c of ['surge', 'steady', 'fade'] as const) {
      let last = 0
      for (let m = 0; m <= 40; m++) {
        const likes = engagementAt(plan({ curve: c }), m).likes!
        expect(likes).toBeGreaterThanOrEqual(last)
        last = likes
      }
    }
  })
  it('treats time before delivery as delivery', () => {
    expect(engagementAt(plan(), -5).likes).toBe(100)
  })
})

describe('replies', () => {
  it('releases replies by time, oldest first', () => {
    expect(repliesAt(plan(), 2)).toEqual([])
    expect(repliesAt(plan(), 10).map((r) => r.id)).toEqual(['r1', 'r2'])
  })
  it('names the next reply still to come', () => {
    expect(nextReply(plan(), 4)?.id).toBe('r2')
    expect(nextReply(plan(), 11)).toBeUndefined()
  })
})

describe('applyEngagement', () => {
  it('sets nested counts without changing the original fields', () => {
    const fields = { text: 'Hi', metrics: { likes: 5, views: 9 } }
    const out = applyEngagement(fields, plan(), ENGAGEMENT_FIELDS.tweet!, 20)
    expect(out).toEqual({ text: 'Hi', metrics: { likes: 1100, reposts: 210, views: 9 } })
    expect(fields.metrics.likes).toBe(5)
  })
  it('puts the newest replies into the comment list, up to its limit', () => {
    const many = plan({
      replies: Array.from({ length: 6 }, (_, i) => ({
        id: `r${i}`,
        atMin: i,
        author: `A${i}`,
        text: `t${i}`,
      })),
    })
    const out = applyEngagement({}, many, ENGAGEMENT_FIELDS.facebook_post!, 30)
    expect(out.comments).toEqual([
      { author: 'A2', text: 't2' },
      { author: 'A3', text: 't3' },
      { author: 'A4', text: 't4' },
      { author: 'A5', text: 't5' },
    ])
  })
  it('keeps the post comments when no reply is out yet', () => {
    const fields = { comments: [{ author: 'X', text: 'y' }] }
    const out = applyEngagement(fields, plan(), ENGAGEMENT_FIELDS.reddit_post!, 0)
    expect(out.comments).toEqual([{ author: 'X', text: 'y' }])
  })
})

describe('defaults and steps', () => {
  it('spreads misinformation and pressure fast, the rest steadily', () => {
    expect(defaultCurve('MISINFORMATION')).toBe('surge')
    expect(defaultCurve('PRESSURE')).toBe('surge')
    expect(defaultCurve('NOISE')).toBe('steady')
  })
  it('steps by refresh interval', () => {
    expect(engagementStep(14.9, 5)).toBe(2)
    expect(engagementStep(3, 1)).toBe(3)
  })
})
