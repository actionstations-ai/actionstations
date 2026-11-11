// The earth science format checks (#674): each rule catches the mistake a specialist would and
// leaves correct text alone.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GEO_LINT_RULE_IDS, runGeoLint } from './geo-lint'

const rules = (text: string, id: string) => runGeoLint(text, [id]).map((i) => i.message)

describe('magnitude_intensity_labels', () => {
  const id = 'magnitude_intensity_labels'
  it('flags a magnitude written as a Roman numeral and an intensity written as a decimal', () => {
    expect(rules('A magnitude VII earthquake struck.', id)).toHaveLength(1)
    expect(rules('Shaking reached MMI 7.2 in the city.', id)).toHaveLength(1)
    expect(rules('The M VIII quake', id)).toHaveLength(1)
    expect(rules('A magnitude XI event', id)).toHaveLength(1)
  })
  it('accepts M 6.8 with intensity VII', () => {
    expect(rules('The M 6.8 earthquake produced intensity VII (MMI) in Haldane.', id)).toEqual([])
  })
})

describe('alert_level_color_pair', () => {
  const id = 'alert_level_color_pair'
  it('accepts the four pairs in either order', () => {
    for (const t of [
      'alert level WATCH, aviation color code ORANGE',
      'NORMAL/GREEN',
      'The volcano is at ORANGE (WATCH).',
      'WARNING / RED',
      'ADVISORY and aviation color code YELLOW',
    ])
      expect(rules(t, id), t).toEqual([])
  })
  it('accepts WARNING with ORANGE, a hazardous eruption with little ash', () => {
    expect(rules('Mauna Loa remains at WARNING / ORANGE as lava flows advance.', id)).toEqual([])
    expect(rules('The volcano is at ORANGE (WARNING).', id)).toEqual([])
  })
  it('flags a wrong pair', () => {
    expect(rules('raised to WATCH / RED', id)[0]).toMatch(/WATCH pairs with .*ORANGE/)
    expect(rules('color code YELLOW, alert level WARNING', id)[0]).toMatch(/YELLOW pairs with/)
    expect(rules('lowered to NORMAL / ORANGE', id)[0]).toMatch(/NORMAL pairs with .*GREEN/)
  })
})

describe('volcano_notice_syntax', () => {
  const id = 'volcano_notice_syntax'
  const good = [
    'VOLCANO OBSERVATORY NOTICE FOR AVIATION (VONA)',
    'DTG: 20261105/1815Z',
    'VOLCANO: HOLLIS 999999',
    'PSN: N4652 W12145',
    'NOTICE NR: 2026/147',
    'CURRENT COLOUR CODE: ORANGE',
    'PREVIOUS COLOUR CODE: YELLOW',
    'SVO: CASCADE VOLCANO OBSERVATORY',
  ].join('\n')
  it('accepts a complete VONA', () => expect(rules(good, id)).toEqual([]))
  it('flags missing lines and a bad time format', () => {
    expect(rules(good.replace('SVO: CASCADE VOLCANO OBSERVATORY', ''), id)).toHaveLength(1)
    expect(rules(good.replace('20261105/1815Z', '2026-11-05 18:15'), id)[0]).toMatch(/YYYYMMDD/)
  })
  it('ignores other text', () => expect(rules('Nothing here', id)).toEqual([]))
})

describe('eew_timing_limits', () => {
  const id = 'eew_timing_limits'
  it('flags warning near the epicenter and warning longer than physics allows', () => {
    expect(rules('Hollis Point, 12 km away, got 8 seconds of warning.', id)[0]).toMatch(
      /within about 20 km/,
    )
    expect(
      rules('Riverbend, 60 km from the epicenter, received 40 seconds of warning', id)[0],
    ).toMatch(/at most about/)
  })
  it('accepts a possible warning time', () => {
    expect(rules('Lakeport, 200 km from the epicenter, had 40 seconds of warning.', id)).toEqual([])
  })
})

describe('aftershock_probability_wording', () => {
  const id = 'aftershock_probability_wording'
  it('flags certainty and predictions', () => {
    expect(rules('Aftershocks will end by Friday.', id)).toHaveLength(1)
    expect(rules('There is no chance of a larger earthquake.', id)).toHaveLength(1)
  })
  it('accepts chances', () => {
    expect(
      rules('There is a 12% chance of an M 5 or larger aftershock in the next week.', id),
    ).toEqual([])
  })
})

describe('tsunami_message_levels', () => {
  const id = 'tsunami_message_levels'
  it('flags a watch sent as a wireless alert and an invented level', () => {
    expect(rules('The tsunami watch was sent as a Wireless Emergency Alert.', id)).toHaveLength(1)
    expect(rules('A tsunami alert level was issued.', id)).toHaveLength(1)
    expect(rules('A tsunami warning, no action required.', id)).toHaveLength(1)
  })
  it('accepts the negation', () => {
    expect(rules('A tsunami watch is not sent as a Wireless Emergency Alert.', id)).toEqual([])
  })
})

describe('tsunami_local_distant_timing', () => {
  const id = 'tsunami_local_distant_timing'
  it('flags hours for a local source and minutes for a distant one', () => {
    expect(rules('The local tsunami reaches Haldane in 3 hours.', id)).toHaveLength(1)
    expect(rules('A distant tsunami arrives in 20 minutes.', id)).toHaveLength(1)
  })
  it('accepts the right scale', () => {
    expect(
      rules(
        'The local tsunami reaches Haldane in 20 minutes; a distant tsunami takes 9 hours.',
        id,
      ),
    ).toEqual([])
  })
})

describe('debris flow and ground failure wording', () => {
  it('flags daily totals as a trigger and site-level certainty', () => {
    expect(
      rules('The debris flow threshold is 2 inches in 24 hours.', 'debris_flow_rainfall_wording'),
    ).toHaveLength(1)
    expect(rules('Your house will liquefy.', 'ground_failure_regional_wording')).toHaveLength(1)
  })
  it('accepts a 15-minute threshold', () => {
    expect(rules('The threshold is 6 mm in 15 minutes.', 'debris_flow_rainfall_wording')).toEqual(
      [],
    )
  })
})

describe('toolkit files', () => {
  it('only name rules this module implements', () => {
    for (const id of ['seismic', 'volcanic', 'tsunami', 'debris_flow']) {
      const t = JSON.parse(
        readFileSync(join(__dirname, '..', '..', '..', 'packs', 'toolkits', `${id}.json`), 'utf8'),
      ) as { lintRules: string[] }
      for (const r of t.lintRules) expect(GEO_LINT_RULE_IDS, `${id}: ${r}`).toContain(r)
    }
  })
  it('ignores rule ids it does not own', () => {
    expect(runGeoLint('M VII', ['somebody_elses_rule'])).toEqual([])
  })
})
