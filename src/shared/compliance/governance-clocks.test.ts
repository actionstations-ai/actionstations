// The governance clocks (spec 0459 FR-8): the SEC Form 8-K Item 1.05 clock after an Attorney
// General delay, and the NYDFS 500.17 notices. Table-driven deadlines, including a federal
// holiday inside the four business days.
import { describe, expect, it } from 'vitest'
import { Regulation } from '@shared/schemas/compliance'
import { deadline, type ClockAnchors } from './clock'
import { formatLocal, parseLocal } from './scenario-time'

const FILES = import.meta.glob<unknown>('../../../packs/regulations/*.json', {
  eager: true,
  import: 'default',
})
const regs = new Map(
  Object.values(FILES).map((raw) => {
    const r = Regulation.parse(raw)
    return [r.id, r]
  }),
)
const reg = (id: string): Regulation => regs.get(id)!

const anchors = (triggers: Record<string, string>): ClockAnchors => ({
  triggers: new Map(Object.entries(triggers).map(([k, v]) => [k, parseLocal(v)])),
  completions: new Map(),
})

function due(id: string, clockId: string, triggers: Record<string, string>): string | undefined {
  const d = deadline(reg(id), clockId, anchors(triggers))
  return 'dueAt' in d ? formatLocal(d.dueAt) : undefined
}

describe('SEC Form 8-K Item 1.05', () => {
  it.each([
    // [clock, trigger, fired at, expected deadline]
    ['form_8k', 'materiality_determined', '2026-10-23T10:05', '2026-10-29T10:05'],
    // Thursday Oct 8: Friday 9, Monday 12 is Columbus Day, so Tuesday 13, Wednesday 14, Thursday 15.
    ['form_8k', 'materiality_determined', '2026-10-08T16:00', '2026-10-15T16:00'],
    // After an Attorney General delay the four business days run from the end of the delay.
    ['form_8k_after_delay', 'delay_ended', '2026-11-30T09:00', '2026-12-04T09:00'],
    // Wednesday Nov 11 (Veterans Day) inside the count: Thursday 12, Friday 13, Monday 16, Tuesday 17.
    ['form_8k_after_delay', 'delay_ended', '2026-11-10T12:00', '2026-11-17T12:00'],
  ])('%s from %s at %s is due %s', (clockId, trigger, at, want) => {
    expect(due('sec_8k_105', clockId, { [trigger]: at })).toBe(want)
  })

  it('does not start the after-delay clock from the determination', () => {
    expect(
      deadline(
        reg('sec_8k_105'),
        'form_8k_after_delay',
        anchors({ materiality_determined: '2026-10-23T10:05' }),
      ),
    ).toEqual({ waiting: ['delay_ended'] })
  })

  it('has the delay trigger and says to confirm the reading with counsel', () => {
    const t = reg('sec_8k_105').triggers.find((x) => x.id === 'delay_ended')!
    expect(t.hint).toMatch(/104B\.02 and 104B\.03/)
    expect(t.hint).toMatch(/counsel/)
  })
})

describe('NYDFS 500.17', () => {
  it.each([
    ['incident_notice', 'incident_determined', '2026-10-23T10:05', '2026-10-26T10:05'],
    ['payment_notice', 'extortion_payment_made', '2026-10-24T20:15', '2026-10-25T20:15'],
    ['payment_explanation', 'extortion_payment_made', '2026-10-24T20:15', '2026-11-23T20:15'],
  ])('%s from %s at %s is due %s', (clockId, trigger, at, want) => {
    expect(due('nydfs_500_17', clockId, { [trigger]: at })).toBe(want)
  })

  it('counts the 72 hours as clock hours, not business days', () => {
    // Friday evening plus 72 hours is Monday evening.
    expect(
      due('nydfs_500_17', 'incident_notice', { incident_determined: '2026-10-23T18:00' }),
    ).toBe('2026-10-26T18:00')
  })

  it('names its source and the date it was checked', () => {
    const r = reg('nydfs_500_17')
    expect(r.sources[0]!.url).toMatch(/law\.cornell\.edu/)
    expect(r.verifiedOn).toBe('2026-11-04')
    expect(r.statusNote).toMatch(/24 hours/)
  })
})
