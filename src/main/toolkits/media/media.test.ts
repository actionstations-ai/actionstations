// Media environment simulators (spec 0458 FR-5, FR-6): determinism, the documented response
// parameters, counters that never fall, and the figures that draw them.
import { describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')

const media = await import('./index')
const { generatorIds } = await import('../../case-data/generators')
const { renderFigure, listFigureKinds } = await import('../../render/figures')

const { newsCycleSchedule, spreadAt, spreadSeries, listeningReport, apportion, SPREAD_PARAMETERS } =
  media

const base = { seed: 7, triggerAtMin: 30, severity: 4, visibility: 'regional' as const }

describe('news cycle schedule', () => {
  it('gives the same schedule for the same seed and a different one for another', () => {
    expect(newsCycleSchedule(base)).toEqual(newsCycleSchedule(base))
    expect(newsCycleSchedule({ ...base, seed: 8 })).not.toEqual(newsCycleSchedule(base))
  })

  it('puts a wire bulletin within minutes, an update after it, and sorts by time', () => {
    const s = newsCycleSchedule(base)
    const bulletin = s.find((i) => i.kind === 'wire_bulletin')!
    expect(bulletin.atMin - base.triggerAtMin).toBeGreaterThanOrEqual(2)
    expect(bulletin.atMin - base.triggerAtMin).toBeLessThanOrEqual(6)
    expect(s.find((i) => i.kind === 'wire_flash')).toBeUndefined()
    expect(s.find((i) => i.kind === 'wire_update')!.atMin).toBeGreaterThan(bulletin.atMin)
    expect(s.map((i) => i.atMin)).toEqual([...s.map((i) => i.atMin)].sort((a, b) => a - b))
  })

  it('keeps a wire flash for the gravest national story only', () => {
    const s = newsCycleSchedule({ ...base, severity: 5, visibility: 'national' })
    expect(s.find((i) => i.kind === 'wire_flash')).toBeDefined()
    expect(s.find((i) => i.kind === 'wire_bulletin')).toBeUndefined()
  })

  it('schedules local TV at the next top of the hour with a deadline 15 minutes before', () => {
    // 08:00 start, trigger at 08:30: the 09:00 newscast is 30 minutes away.
    const tv = newsCycleSchedule({ ...base, startMinuteOfDay: 480 }).find(
      (i) => i.kind === 'local_tv',
    )!
    expect(tv.atMin).toBe(60)
    expect(tv.deadlineMin).toBe(45)
    // At 08:50 the 09:00 newscast is too close; the 10:00 one takes the story.
    const late = newsCycleSchedule({ ...base, triggerAtMin: 50 }).find(
      (i) => i.kind === 'local_tv',
    )!
    expect(late.atMin).toBe(120)
  })

  it('scales reporter contacts with severity and visibility, each with a deadline', () => {
    const count = (severity: number, visibility: 'local' | 'national') =>
      newsCycleSchedule({ ...base, severity, visibility }).filter((i) =>
        i.kind.startsWith('reporter_'),
      )
    expect(count(5, 'national').length).toBeGreaterThan(count(2, 'local').length)
    for (const r of count(3, 'national')) expect(r.deadlineMin).toBeGreaterThan(r.atMin)
  })

  it('writes a "has not commented" follow-up when no statement comes in time, and reacts to one that does', () => {
    const silent = newsCycleSchedule(base).filter((i) => i.kind === 'follow_up')
    expect(silent.some((i) => /not commented/.test(i.brief))).toBe(true)
    const answered = newsCycleSchedule({
      ...base,
      responses: [{ atMin: 45, kind: 'holding_statement' }],
    }).filter((i) => i.kind === 'follow_up')
    expect(answered.some((i) => /not commented/.test(i.brief))).toBe(false)
    expect(answered.some((i) => /quotes the holding statement/.test(i.brief))).toBe(true)
  })

  it('marks every item simulated and uses only fictional outlets', () => {
    for (const i of newsCycleSchedule(base)) {
      expect(i.simulated).toBe(true)
      expect(i.outlet).not.toMatch(/\b(CNN|BBC|Reuters|Associated Press|Fox|NBC|CBS|ABC)\b/)
    }
  })
})

const spread = { seed: 3, reach: 100000, peakAtMin: 90 }

describe('social spread', () => {
  it('is deterministic and starts at zero', () => {
    expect(spreadAt(spread, 60)).toEqual(spreadAt(spread, 60))
    expect(spreadAt(spread, 0).views).toBe(0)
  })

  it('never lets a counter decrease, with or without responses', () => {
    const withResponses = { ...spread, responses: [{ atMin: 40, kind: 'correction' as const }] }
    for (const p of [spread, withResponses]) {
      const s = spreadSeries(p, 10, 600)
      for (let i = 1; i < s.length; i++)
        for (const k of ['views', 'likes', 'reposts', 'replies'] as const)
          expect(s[i]![k]).toBeGreaterThanOrEqual(s[i - 1]![k])
    }
  })

  it('a timely correction slows later growth more than a late one, and silence changes nothing', () => {
    const at = 600
    const none = spreadAt(spread, at).views
    const timely = spreadAt({ ...spread, responses: [{ atMin: 30, kind: 'correction' }] }, at).views
    const late = spreadAt({ ...spread, responses: [{ atMin: 200, kind: 'correction' }] }, at).views
    const statementOnly = spreadAt(
      { ...spread, responses: [{ atMin: 30, kind: 'statement' }] },
      at,
    ).views
    expect(timely).toBeLessThan(late)
    expect(late).toBeLessThan(none)
    expect(statementOnly).toBe(none)
    expect(SPREAD_PARAMETERS.reduction.correction[0]).toBeGreaterThan(
      SPREAD_PARAMETERS.reduction.correction[1],
    )
  })

  it('does not change what was already seen before the response', () => {
    const answered = { ...spread, responses: [{ atMin: 100, kind: 'correction' as const }] }
    expect(spreadAt(answered, 100).views).toBe(spreadAt(spread, 100).views)
    expect(spreadAt(answered, 400).viewsUnanswered).toBe(spreadAt(spread, 400).views)
  })

  it('never drops growth below the floor however many responses', () => {
    const many = {
      ...spread,
      responses: Array.from({ length: 6 }, (_, i) => ({
        atMin: 10 + i * 5,
        kind: 'takedown' as const,
      })),
    }
    const answered = spreadAt(many, 5000).views
    const unanswered = spreadAt(spread, 5000).views
    expect(answered).toBeGreaterThan(unanswered * SPREAD_PARAMETERS.growthFloor * 0.5)
  })

  it('reduces the false-claim share after a timely correction and keeps sentiment counts summing to replies', () => {
    const narratives = [
      { label: 'The plant is leaking', weight: 3, isFalse: true },
      { label: 'Crews are on site', weight: 2, isFalse: false },
    ]
    const p = { ...spread, narratives }
    const fixed = { ...p, responses: [{ atMin: 20, kind: 'correction' as const }] }
    const a = spreadAt(p, 500)
    const b = spreadAt(fixed, 500)
    expect(b.sentiment.false_claim / Math.max(1, b.replies)).toBeLessThan(
      a.sentiment.false_claim / Math.max(1, a.replies),
    )
    expect(Object.values(b.sentiment).reduce((n, v) => n + v, 0)).toBe(b.replies)
    expect(b.narratives.find((n) => n.isFalse)!.volume).toBeLessThan(
      a.narratives.find((n) => n.isFalse)!.volume,
    )
    expect(b.narratives.find((n) => !n.isFalse)!.volume).toBe(
      a.narratives.find((n) => !n.isFalse)!.volume,
    )
  })

  it('makes hostile replies likelier after long silence', () => {
    const early = listeningReport(spread, 100).sentiment.find((s) => s.label === 'hostile')!.share
    const late = listeningReport(spread, 400).sentiment.find((s) => s.label === 'hostile')!.share
    expect(late).toBeGreaterThan(early)
  })

  it('apportions replies exactly', () => {
    const out = apportion(17, { a: 0.5, b: 0.3, c: 0.2 })
    expect(out.a + out.b + out.c).toBe(17)
  })

  it('writes counters through the tweet engagement fields without touching the input', () => {
    const fields = { text: 'x', metrics: { likes: 0, reposts: 0, replies: 0, views: 0 } }
    const state = spreadAt(spread, 200)
    const out = media.applySpreadToFields('tweet', fields, state) as typeof fields
    expect(out.metrics.views).toBe(state.views)
    expect(out.metrics.likes).toBe(state.likes)
    expect(fields.metrics.views).toBe(0)
  })
})

describe('media figures and generators', () => {
  const states = spreadSeries(
    { ...spread, responses: [{ atMin: 40, kind: 'correction' }] },
    30,
    360,
  )

  it('registers the four kinds', () => {
    for (const k of [
      'media.spread',
      'media.sentiment',
      'media.narratives',
      'media.coverage_timeline',
    ])
      expect(listFigureKinds()).toContain(k)
  })

  it('draws the spread with a simulated title, a summary and a data table', () => {
    const r = renderFigure({
      kind: 'media.spread',
      data: {
        points: states.map((s) => ({
          atMin: s.atMin,
          views: s.views,
          viewsUnanswered: s.viewsUnanswered,
        })),
        responses: [{ atMin: 40, label: 'Correction posted' }],
      },
    })
    expect(r.svg).toContain('Simulated')
    expect(r.summary).toMatch(/teaching model/)
    expect(r.table?.rows.length).toBeGreaterThan(0)
    expect(r.table?.caption).toMatch(/simulated/)
  })

  it('draws sentiment, narratives and the coverage timeline', () => {
    const s = states[states.length - 1]!
    const sentiment = renderFigure({
      kind: 'media.sentiment',
      data: { buckets: [{ label: '1 hour', ...s.sentiment }] },
    })
    expect(sentiment.summary).toMatch(/False claim/)
    const narratives = renderFigure({
      kind: 'media.narratives',
      data: { narratives: [{ label: 'The plant is leaking', volume: 40, isFalse: true }] },
    })
    expect(narratives.summary).toMatch(/false claim/)
    const timeline = renderFigure({
      kind: 'media.coverage_timeline',
      data: {
        items: newsCycleSchedule(base)
          .slice(0, 6)
          .map((i) => ({ atMin: i.atMin, label: `${i.outlet}: ${i.kind}`, lane: i.outlet })),
      },
    })
    expect(timeline.svg).toContain('Simulated')
    expect(
      renderFigure({
        kind: 'media.spread',
        data: {
          points: [
            { atMin: 0, views: 0, viewsUnanswered: 0 },
            { atMin: 10, views: 5, viewsUnanswered: 5 },
          ],
        },
      }).svg,
    ).toBe(
      renderFigure({
        kind: 'media.spread',
        data: {
          points: [
            { atMin: 0, views: 0, viewsUnanswered: 0 },
            { atMin: 10, views: 5, viewsUnanswered: 5 },
          ],
        },
      }).svg,
    )
  })

  it('leaves no id of the toolkit without code once the toolkit is registered', async () => {
    const { readFileSync } = await import('node:fs')
    const { ToolkitSchema } = await import('@shared/toolkits')
    const { unknownCapabilityWarnings } = await import('../capabilities')
    await import('./register-lint')
    media.registerMediaToolkit()
    const toolkit = ToolkitSchema.parse(
      JSON.parse(readFileSync(resolve('packs/toolkits/media_environment.json'), 'utf8')),
    )
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })

  it('registers its generators once', () => {
    media.registerMediaToolkit()
    media.registerMediaToolkit()
    expect(generatorIds()).toEqual(
      expect.arrayContaining(['media-news-cycle', 'media-social-spread']),
    )
  })
})
