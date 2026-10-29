import { describe, expect, it } from 'vitest'
import { ComplianceSession, Regulation } from '@shared/schemas/compliance'
import { anchorsFrom, clockStatus, clockViews, deadline, type ClockAnchors } from './clock'
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
const reg = (id: string): Regulation => regs.get(id)!

const anchors = (
  triggers: Record<string, string>,
  filed: Record<string, string> = {},
): ClockAnchors => ({
  triggers: new Map(Object.entries(triggers).map(([k, v]) => [k, parseLocal(v)])),
  completions: new Map(
    Object.entries(filed).map(([k, v]) => [k, { status: 'met', note: '', atDate: parseLocal(v) }]),
  ),
})

function due(id: string, clockId: string, a: ClockAnchors): string | undefined {
  const d = deadline(reg(id), clockId, a)
  return 'dueAt' in d ? formatLocal(d.dueAt) : undefined
}

describe('deadlines of the bundled regulations', () => {
  it.each([
    // [regulation, clock, triggers, filed clocks, expected deadline]
    [
      'sec_8k_105',
      'form_8k',
      { materiality_determined: '2026-03-12T10:40' },
      {},
      '2026-03-18T10:40',
    ],
    // Thursday before Labor Day 2026: Monday is a federal holiday, so the 4th day is Thursday.
    [
      'sec_8k_105',
      'form_8k',
      { materiality_determined: '2026-09-03T10:40' },
      {},
      '2026-09-10T10:40',
    ],
    // Over Thanksgiving (Thursday 26 Nov 2026).
    [
      'sec_8k_105',
      'form_8k',
      { materiality_determined: '2026-11-24T16:00' },
      {},
      '2026-12-01T16:00',
    ],
    ['circia', 'incident_report', { covered_incident: '2026-03-12T09:12' }, {}, '2026-03-15T09:12'],
    ['circia', 'ransom_report', { ransom_paid: '2026-03-13T22:30' }, {}, '2026-03-14T22:30'],
    [
      'tsa_aviation_cyber',
      'cisa_report',
      { incident_identified: '2026-03-12T09:00' },
      {},
      '2026-03-13T09:00',
    ],
    [
      'tsa_rail_cyber',
      'cisa_report',
      { incident_identified: '2026-03-12T09:00' },
      {},
      '2026-03-13T09:00',
    ],
    [
      'tsa_pipeline_cyber',
      'cisa_report',
      { incident_identified: '2026-03-12T09:00' },
      {},
      '2026-03-13T09:00',
    ],
    [
      'hipaa_breach',
      'individuals',
      { breach_discovered: '2026-03-12T09:00' },
      {},
      '2026-05-11T09:00',
    ],
    ['hipaa_breach', 'hhs', { breach_discovered: '2026-03-12T09:00' }, {}, '2026-05-11T09:00'],
    ['gdpr_art33', 'authority', { aware: '2026-03-12T09:00' }, {}, '2026-03-15T09:00'],
    ['nis2_art23', 'early_warning', { aware: '2026-03-12T09:00' }, {}, '2026-03-13T09:00'],
    ['nis2_art23', 'notification', { aware: '2026-03-12T09:00' }, {}, '2026-03-15T09:00'],
    // NIS2 chained clock: one month after the incident notification was filed.
    [
      'nis2_art23',
      'final_report',
      { aware: '2026-01-29T09:00' },
      { notification: '2026-01-31T11:00' },
      '2026-02-28T11:00',
    ],
    // DORA earliest-of: 4 h after classification wins when classification is early …
    [
      'dora_art19',
      'initial',
      { aware: '2026-03-12T09:00', classified_major: '2026-03-12T10:00' },
      {},
      '2026-03-12T14:00',
    ],
    // … and 24 h after awareness wins when classification is late.
    [
      'dora_art19',
      'initial',
      { aware: '2026-03-12T09:00', classified_major: '2026-03-13T07:00' },
      {},
      '2026-03-13T09:00',
    ],
    // Before classification, the 24-hour term already bounds the deadline.
    ['dora_art19', 'initial', { aware: '2026-03-12T09:00' }, {}, '2026-03-13T09:00'],
    [
      'dora_art19',
      'intermediate',
      { aware: '2026-03-12T09:00' },
      { initial: '2026-03-12T13:00' },
      '2026-03-15T13:00',
    ],
  ] as const)('%s %s', (id, clockId, triggers, filed, want) => {
    expect(due(id, clockId, anchors(triggers, filed))).toBe(want)
  })

  it('a clock waits for its trigger', () => {
    expect(
      deadline(reg('sec_8k_105'), 'form_8k', anchors({ discovered: '2026-03-12T09:00' })),
    ).toEqual({
      waiting: ['materiality_determined'],
    })
  })

  it('a chained clock waits for the filing it counts from', () => {
    expect(
      deadline(reg('nis2_art23'), 'final_report', anchors({ aware: '2026-03-12T09:00' })),
    ).toEqual({
      waiting: ['clock:notification'],
    })
  })

  it('ignores DST: a 24-hour clock across the US spring change is 24 hours on the wall clock', () => {
    expect(
      due(
        'tsa_aviation_cyber',
        'cisa_report',
        anchors({ incident_identified: '2026-03-07T12:00' }),
      ),
    ).toBe('2026-03-08T12:00')
  })
})

describe('clock status', () => {
  const d = {
    dueAt: parseLocal('2026-03-15T09:00'),
    startedAt: parseLocal('2026-03-12T09:00'),
    term: 0,
  }
  const at = (s: string) => parseLocal(s)

  it.each([
    ['2026-03-12T10:00', 'running'],
    ['2026-03-14T16:00', 'due_soon'], // 17 h of 72 h left (under 25 %)
    ['2026-03-15T09:00', 'due_soon'],
    ['2026-03-15T09:01', 'overdue'],
  ] as const)('at %s it is %s', (now, want) => {
    expect(clockStatus(d, at(now), undefined)).toBe(want)
  })

  it('filed before the deadline is met; filed after it is missed', () => {
    expect(
      clockStatus(d, at('2026-03-20T00:00'), {
        status: 'met',
        note: '',
        atDate: at('2026-03-14T09:00'),
      }),
    ).toBe('met')
    expect(
      clockStatus(d, at('2026-03-20T00:00'), {
        status: 'met',
        note: '',
        atDate: at('2026-03-16T09:00'),
      }),
    ).toBe('missed')
  })

  it('waived and missed override the deadline', () => {
    expect(clockStatus(d, at('2026-03-12T10:00'), { status: 'waived', note: 'Not in scope' })).toBe(
      'waived',
    )
    expect(
      clockStatus({ waiting: ['aware'] }, at('2026-03-12T10:00'), { status: 'missed', note: '' }),
    ).toBe('missed')
    expect(clockStatus({ waiting: ['aware'] }, at('2026-03-12T10:00'), undefined)).toBe('waiting')
  })
})

describe('clock views from the facilitator session', () => {
  const start = parseLocal('2026-03-12T09:00')
  const session = ComplianceSession.parse({
    fired: [
      {
        id: 'f1',
        regulationId: 'circia',
        triggerId: 'covered_incident',
        exerciseMin: 12,
        scenarioAt: '2026-03-12T09:12',
        by: 'row',
        rowId: 'I-03',
      },
      // A later firing of the same trigger does not move the clock.
      {
        id: 'f2',
        regulationId: 'circia',
        triggerId: 'covered_incident',
        exerciseMin: 90,
        scenarioAt: '2026-03-12T10:30',
        by: 'manual',
      },
    ],
  })

  it('counts from the first firing and reports minutes left', () => {
    const [incident, ransom] = clockViews(reg('circia'), session, start, 60)
    expect(incident).toMatchObject({
      key: 'circia:incident_report',
      status: 'running',
      minutesLeft: 72 * 60 - 48,
    })
    expect(formatLocal(incident!.dueAt!)).toBe('2026-03-15T09:12')
    expect(ransom).toMatchObject({ status: 'waiting', waitingFor: ['ransom_paid'] })
  })

  it('a time jump that moves the exercise clock moves the clocks with it', () => {
    const [incident] = clockViews(reg('circia'), session, start, 70 * 60)
    expect(incident!.status).toBe('due_soon')
  })

  it('reads completions for its own regulation only', () => {
    const s = ComplianceSession.parse({
      ...session,
      clocks: {
        'circia:incident_report': { status: 'met', exerciseMin: 600 },
        'gdpr_art33:authority': { status: 'waived' },
      },
    })
    const a = anchorsFrom('circia', s, start)
    expect([...a.completions.keys()]).toEqual(['incident_report'])
    expect(clockViews(reg('circia'), s, start, 700)[0]!.status).toBe('met')
  })
})
