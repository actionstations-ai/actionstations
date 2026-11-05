// The CDC ship illness reporting regulation (#843, spec 0470 FR-9): the 24-hour and 4-hour report
// points are placed with triggers before arrival, the clocks add the remaining time, and the
// special reports follow the 2 and 3 percent levels.
import { describe, expect, it } from 'vitest'
import { Regulation } from '@shared/schemas/compliance'
import raw from '../../../packs/regulations/cdc_ship_illness_reporting.json'
import { deadline, type ClockAnchors } from './clock'
import { formatLocal, parseLocal } from './scenario-time'

const reg = Regulation.parse(raw)

const anchors = (triggers: Record<string, string>): ClockAnchors => ({
  triggers: new Map(Object.entries(triggers).map(([k, v]) => [k, parseLocal(v)])),
  completions: new Map(),
})

const due = (clock: string, triggers: Record<string, string>): string | undefined => {
  const d = deadline(reg, clock, anchors(triggers))
  return 'dueAt' in d ? formatLocal(d.dueAt) : undefined
}

// Arrival is Nov 7 06:30: 36 hours before is Nov 5 18:30 and 24 hours before is Nov 6 06:30.
const ARRIVAL_MINUS_36 = '2026-11-05T18:30'
const ARRIVAL_MINUS_24 = '2026-11-06T06:30'

describe('cdc_ship_illness_reporting', () => {
  it('is in force, dated, and cites 42 CFR 71.21 and the VSP standards', () => {
    expect(reg.status).toBe('in_force')
    expect(reg.citation).toMatch(/42 CFR 71\.21/)
    expect(reg.sources.map((s) => s.url).join(' ')).toMatch(/cdc\.gov/)
    expect(reg.triggers.map((t) => t.id)).toEqual([
      'death_or_illness',
      'arrival_minus_36h',
      'arrival_minus_24h',
      'level_2_reached',
      'level_3_reached',
    ])
  })

  it('puts the 24-hour report deadline 24 hours before arrival', () => {
    expect(due('age_24h', { arrival_minus_36h: ARRIVAL_MINUS_36 })).toBe('2026-11-06T06:30')
  })

  it('puts the 4-hour update deadline 4 hours before arrival', () => {
    expect(due('age_4h', { arrival_minus_24h: ARRIVAL_MINUS_24 })).toBe('2026-11-07T02:30')
  })

  it('counts special reports from the level reached', () => {
    expect(due('special_2pct', { level_2_reached: '2026-11-05T14:20' })).toBe('2026-11-05T15:20')
    expect(due('special_3pct', { level_3_reached: '2026-11-06T09:00' })).toBe('2026-11-06T10:00')
  })

  it('waits for its trigger and says so', () => {
    const d = deadline(reg, 'age_24h', anchors({}))
    expect('waiting' in d).toBe(true)
  })

  it('is for the outbreak family the hospitality domain defines', () => {
    expect(reg.appliesTo.threatFamilies).toEqual(['outbreak_at_sea'])
  })
})
