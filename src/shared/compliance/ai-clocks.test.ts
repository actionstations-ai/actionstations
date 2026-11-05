// The AI incident clocks (spec 0467 FR-8, NFR-5): the Article 73 day counts from awareness, the
// 8-K four business days from a materiality decision across weekends and holidays, the dates kept
// as data with their source, and the warning for a definition older than twelve months.
import { describe, expect, it } from 'vitest'
import { Regulation } from '@shared/schemas/compliance'
import { deadline, type ClockAnchors } from './clock'
import { isStale, monthsSince } from './freshness'
import { formatLocal, parseLocal } from './scenario-time'

const REG_FILES = import.meta.glob<unknown>('../../../packs/regulations/*.json', {
  eager: true,
  import: 'default',
})
const regs = new Map(
  Object.values(REG_FILES).map((raw) => {
    const r = Regulation.parse(raw)
    return [r.id, r]
  }),
)
const ai = regs.get('eu_ai_act_art73')!

const at = (triggers: Record<string, string>): ClockAnchors => ({
  triggers: new Map(Object.entries(triggers).map(([k, v]) => [k, parseLocal(v)])),
  completions: new Map(),
})

function due(regId: string, clockId: string, triggers: Record<string, string>): string | undefined {
  const d = deadline(regs.get(regId)!, clockId, at(triggers))
  return 'dueAt' in d ? formatLocal(d.dueAt) : undefined
}

describe('EU AI Act Article 73 clocks', () => {
  it('counts 15 days from awareness of a serious incident', () => {
    expect(
      due('eu_ai_act_art73', 'serious_incident_report', {
        aware_serious_incident: '2026-11-03T09:40',
      }),
    ).toBe('2026-11-18T09:40')
  })

  it('counts 2 days for a widespread infringement or critical infrastructure incident', () => {
    expect(
      due('eu_ai_act_art73', 'widespread_report', { aware_widespread: '2026-11-03T09:40' }),
    ).toBe('2026-11-05T09:40')
  })

  it('counts 10 days from awareness of a death', () => {
    expect(due('eu_ai_act_art73', 'death_report', { aware_death: '2026-11-03T09:40' })).toBe(
      '2026-11-13T09:40',
    )
  })

  it('starts each clock from its own trigger, so a scenario starts only the one that applies', () => {
    for (const c of ai.clocks) expect(c.dueAt).toHaveLength(1)
    expect(new Set(ai.clocks.map((c) => c.dueAt[0]!.from)).size).toBe(3)
    expect(
      due('eu_ai_act_art73', 'death_report', { aware_serious_incident: '2026-11-03T09:40' }),
    ).toBeUndefined()
  })

  it('points to the filing template and says an incomplete first report is allowed', () => {
    for (const c of ai.clocks) expect(c.injectTypes).toContain('serious_incident_notice')
    expect(ai.clocks[0]!.rule).toMatch(/incomplete initial report is allowed/)
  })

  it('limits its scope in words: providers of high-risk systems, not fraud victims, and no legal advice', () => {
    expect(ai.statusNote).toMatch(/providers of high-risk AI systems/)
    expect(ai.statusNote).toMatch(/fraud and cyber incident/)
    expect(ai.statusNote).toMatch(/not legal advice/)
    expect(ai.appliesTo.note).toMatch(/role/)
  })

  it('keeps the application dates as data with a note that they need checking', () => {
    expect(ai.dates.map((d) => d.date)).toEqual(['2027-12-02', '2028-08-02'])
    for (const d of ai.dates) expect(d.note).toMatch(/Official Journal/)
  })

  it('cites the law and carries a checked-on date', () => {
    expect(ai.sources.some((s) => s.url.startsWith('https://eur-lex.europa.eu/'))).toBe(true)
    expect(ai.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('SEC Form 8-K Item 1.05 for an AI vendor breach or poisoning that is a cyber incident', () => {
  it('counts four business days from the materiality decision across a weekend and Veterans Day', () => {
    // Friday 6 Nov 2026: Mon 9, Tue 10, (Wed 11 is a federal holiday), Thu 12, Fri 13.
    expect(due('sec_8k_105', 'form_8k', { materiality_determined: '2026-11-06T10:00' })).toBe(
      '2026-11-13T10:00',
    )
  })
})

describe('the twelve month warning', () => {
  it('counts whole months and flags a definition older than twelve', () => {
    const today = new Date(2026, 10, 5)
    expect(monthsSince('2025-11-05', today)).toBe(12)
    expect(isStale('2025-11-05', today)).toBe(false)
    expect(isStale('2025-10-05', today)).toBe(true)
    expect(isStale(ai.verifiedOn, today)).toBe(false)
  })
})
