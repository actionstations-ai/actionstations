// The media format rules (spec 0458 FR-4) on good and bad injects.
import { describe, expect, it } from 'vitest'
import { lintMediaInject } from './lint'

const rules = (type: string, fields: Record<string, unknown>, ctx = {}, variant = 'default') =>
  lintMediaInject(type, fields, ctx, variant).map((i) => i.rule)

describe('media.correction', () => {
  const good = {
    wasWrong: 'The video showed a plant fire.',
    isRight: 'The video was filmed in 2022 elsewhere.',
    headline: 'Correction: video origin',
  }

  it('passes a correction that names the error and the fix', () => {
    expect(rules('correction_notice', good)).toEqual([])
  })

  it('flags a missing fix, identical text and a headline that repeats the false claim', () => {
    expect(rules('correction_notice', { ...good, isRight: '' })).toContain('media.correction')
    expect(rules('correction_notice', { ...good, isRight: good.wasWrong })).toContain(
      'media.correction',
    )
    expect(
      rules('correction_notice', { ...good, headline: 'The video showed a plant fire' }),
    ).toContain('media.correction')
  })
})

describe('media.holding_statement', () => {
  const good = {
    known: ['Access detected.'],
    notKnown: ['Scope is not known.'],
    beingDone: ['Server isolated.'],
    nextUpdate: 'Next update at 6 PM.',
  }

  it('passes a statement with all three parts and a next update', () => {
    expect(rules('holding_statement', good)).toEqual([])
  })

  it('flags each missing part, but not for the full variant', () => {
    expect(rules('holding_statement', { ...good, notKnown: [] })).toEqual([
      'media.holding_statement',
    ])
    expect(rules('holding_statement', { ...good, beingDone: [], nextUpdate: '' })).toHaveLength(2)
    expect(rules('holding_statement', { body: 'Long text' }, {}, 'full')).toEqual([])
  })

  it('flags a statement that is too long', () => {
    const long = { ...good, known: [Array.from({ length: 220 }, () => 'word').join(' ')] }
    expect(rules('holding_statement', long)).toContain('media.holding_statement')
  })
})

describe('media.attribution', () => {
  it('flags a quote with no speaker and an unnamed source', () => {
    const issues = rules('news_article', {
      body: 'Officials are looking into it.\n\n"We never saw anything like this before in town."\n\nSources say the plant was empty.',
    })
    expect(issues.filter((r) => r === 'media.attribution').length).toBeGreaterThanOrEqual(2)
  })

  it('passes attributed copy and ignores types it does not cover', () => {
    expect(
      rules('news_article', {
        body: 'A spokesperson said the plant was empty. "We are checking," said Dana Whitfield.',
      }),
    ).toEqual([])
    expect(rules('tweet', { text: '"no speaker here at all friends"' })).toEqual([])
  })
})

describe('media.clock', () => {
  it('flags a stamp far from the inject delivery time and accepts one inside the tolerance', () => {
    const ctx = { deliveryMinuteOfDay: 15 * 60 + 10 }
    expect(rules('media_advisory', { issuedAt: 'November 4, 2026 · 3:10 PM ET' }, ctx)).toEqual([])
    expect(rules('media_advisory', { issuedAt: 'November 4, 2026 · 9:45 AM ET' }, ctx)).toContain(
      'media.clock',
    )
  })

  it('does nothing without a clock', () => {
    expect(rules('media_advisory', { issuedAt: '1:00 AM' })).toEqual([])
  })
})

describe('media.fictional_names', () => {
  it('flags real outlets and public figures, whole words only, and a project list', () => {
    expect(rules('news_article', { outlet: 'Reuters', body: 'said Joe Biden.' })).toEqual([
      'media.fictional_names',
      'media.fictional_names',
    ])
    expect(rules('news_article', { body: 'The Abbc News Letter said so.' })).toEqual([])
    expect(
      rules('news_article', { body: 'Daily Planet said.' }, { extraRealNames: ['Daily Planet'] }),
    ).toEqual(['media.fictional_names'])
  })

  it('passes the preview data of every bundled media template', () => {
    // The previews use fictional outlets and people only.
    const names = [
      'Meridian Wire',
      'The Lakeshore Courier',
      'Harborview 7 News',
      'Halyard Components, Inc.',
    ]
    for (const n of names) expect(rules('wire_alert', { wireName: n })).toEqual([])
  })
})
