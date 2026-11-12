// Spill notification timeliness (#1132): each required notification is matched to a decision
// that names its party; met, late and missed are reported per party, and notification decisions
// that met nothing are listed separately.
import { describe, expect, it } from 'vitest'
import { runMetric } from './registry'
import { NO_PARTY, partiesNamed, partyOf } from './spill-notifications'

const T0 = Date.parse('2026-11-04T12:00:00.000Z')
const at = (min: number): string => new Date(T0 + min * 60_000).toISOString()
const due = (id: string, min: number, who: string) => ({
  id,
  time: at(min),
  kind: 'notification_due',
  attrs: { who },
})
const notify = (id: string, min: number, fields: Record<string, unknown>) => ({
  id,
  time: at(min),
  kind: 'make_notifications',
  fields,
})
const CONFIG = {
  decisionKinds: ['make_notifications'],
  eventKinds: ['notification_due'],
  partyFields: ['who', 'also_notified', 'also_notified_2'],
}
const run = (
  events: ReturnType<typeof due>[],
  decisions: ReturnType<typeof notify>[],
  config: Record<string, unknown> = CONFIG,
) => runMetric({ id: 'spill_notification_timeliness', config }, { events, decisions })

describe('party names', () => {
  it('reads the form option ids, the plan labels and the common short forms as one party', () => {
    for (const name of ['national_response_center', 'National Response Center', 'NRC', 'nrc'])
      expect(partyOf(name)?.id).toBe('nrc')
    expect(partyOf('qualified_individual')?.id).toBe('qi')
    expect(partyOf('State')?.id).toBe('state')
    expect(partyOf('natural-resource-trustees')?.id).toBe('trustees')
    expect(partyOf('Harbor pilots')).toEqual({ id: 'other:harbor_pilots', label: 'Harbor pilots' })
    expect(partyOf('')).toBeNull()
    expect(partyOf(undefined)).toBeNull()
  })

  it('collects each party a decision names once, from every party field', () => {
    const d = notify('d', 0, {
      who: 'national_response_center',
      also_notified: 'state_environmental_agency',
      also_notified_2: 'national_response_center',
      notes: 'Called both',
    })
    expect(partiesNamed(d, CONFIG.partyFields).map((p) => p.id)).toEqual(['nrc', 'state'])
  })
})

describe('spill notification timeliness', () => {
  it('meets a notification only with a decision naming that party, with minutes early', () => {
    const out = run(
      [
        due('n-nrc', 30, 'National Response Center'),
        due('n-state', 120, 'State environmental agency'),
      ],
      [
        notify('d1', 10, { who: 'national_response_center' }),
        notify('d2', 100, { who: 'state_environmental_agency' }),
      ],
    )
    expect(out.data).toMatchObject({ met: 2, late: 0, missed: 0, unmatched: 0 })
    expect(out.data.byDue).toMatchObject({
      'n-nrc': { party: 'nrc', status: 'met', minutesEarly: 20, decisionId: 'd1' },
      'n-state': { party: 'state', status: 'met', minutesEarly: 20, decisionId: 'd2' },
    })
  })

  it('does not let a call to one party meet another party’s deadline', () => {
    // The old measure counted any notification in the hour before: the QI call at 25 would have
    // met the NRC's 30-minute deadline.
    const out = run([due('n-nrc', 30, 'NRC')], [notify('d1', 25, { who: 'qualified_individual' })])
    expect(out.data).toMatchObject({ met: 0, late: 0, missed: 1, unmatched: 1 })
    expect(out.data.unmatchedDecisions).toEqual([{ id: 'd1', party: 'Qualified Individual' }])
  })

  it('reports a notification made after its due time as late, with the minutes late', () => {
    const out = run(
      [due('n-state', 120, 'State environmental agency')],
      [notify('d1', 135, { who: 'state_environmental_agency' })],
    )
    expect(out.data).toMatchObject({ met: 0, late: 1, missed: 0 })
    expect(out.data.byDue).toMatchObject({
      'n-state': { status: 'late', minutesEarly: null, minutesLate: 15, decisionId: 'd1' },
    })
    const table = out.tables.find((t) => t.title === 'Required notifications')!
    expect(table.rows[0]).toEqual([
      'State environmental agency',
      at(120),
      'Late',
      '',
      '15 min',
      'd1',
      at(135),
    ])
  })

  it('reports a party no decision names as missed', () => {
    const out = run(
      [due('n-nrc', 30, 'NRC'), due('n-trustees', 240, 'Natural resource trustees')],
      [notify('d1', 5, { who: 'national_response_center' })],
    )
    expect(out.data).toMatchObject({ met: 1, missed: 1 })
    expect(out.data.byDue).toMatchObject({
      'n-trustees': { party: 'trustees', status: 'missed', decisionId: null },
    })
  })

  it('lets one decision naming several parties meet each of their deadlines', () => {
    const out = run(
      [
        due('n-qi', 30, 'Qualified Individual'),
        due('n-nrc', 30, 'National Response Center'),
        due('n-state', 60, 'State environmental agency'),
      ],
      [
        notify('d1', 15, {
          who: 'national_response_center',
          also_notified: 'qualified_individual',
          also_notified_2: 'state_environmental_agency',
        }),
      ],
    )
    expect(out.data).toMatchObject({ met: 3, late: 0, missed: 0, unmatched: 0 })
    expect(out.data.byDue).toMatchObject({
      'n-qi': { decisionId: 'd1', minutesEarly: 15 },
      'n-nrc': { decisionId: 'd1', minutesEarly: 15 },
      'n-state': { decisionId: 'd1', minutesEarly: 45 },
    })
  })

  it('enforces no order between the NRC report and the qualified individual call', () => {
    // NRC first, then the QI: both met. The person in charge reports to the NRC immediately.
    const nrcFirst = run(
      [due('n-nrc', 30, 'NRC'), due('n-qi', 30, 'QI')],
      [notify('d1', 5, { who: 'national_response_center' }), notify('d2', 20, { who: 'qi' })],
    )
    const qiFirst = run(
      [due('n-nrc', 30, 'NRC'), due('n-qi', 30, 'QI')],
      [notify('d1', 5, { who: 'qualified_individual' }), notify('d2', 20, { who: 'nrc' })],
    )
    expect(nrcFirst.data).toMatchObject({ met: 2, late: 0, missed: 0 })
    expect(qiFirst.data).toMatchObject({ met: 2, late: 0, missed: 0 })
  })

  it('counts an older decision with no party for no requirement and says so', () => {
    const out = run(
      [due('n-nrc', 30, 'NRC')],
      [notify('old', 10, { time: '0:10', notes: 'Made the calls' })],
    )
    expect(out.data).toMatchObject({ met: 0, missed: 1, unmatched: 1, noParty: 1 })
    expect(out.data.unmatchedDecisions).toEqual([{ id: 'old', party: NO_PARTY }])
    expect(out.summary).toContainEqual({ label: 'Decisions naming no party', value: '1' })
    expect(out.caveats.join(' ')).toMatch(/name no party/)
  })

  it('uses each decision once per party, so a second deadline for the same party needs a second call', () => {
    const out = run(
      [due('initial', 30, 'NRC'), due('update', 240, 'NRC')],
      [notify('d1', 10, { who: 'nrc' }), notify('d2', 260, { who: 'nrc' })],
    )
    expect(out.data.byDue).toMatchObject({
      initial: { status: 'met', decisionId: 'd1' },
      update: { status: 'late', minutesLate: 20, decisionId: 'd2' },
    })
  })

  it('lists extra calls and parties with no requirement as unmatched', () => {
    const out = run(
      [due('n-nrc', 30, 'NRC')],
      [
        notify('d1', 10, { who: 'nrc', also_notified: 'downstream_water_utility' }),
        notify('d2', 50, { who: 'nrc' }),
        notify('x', 5, { who: 'nrc' }),
      ].map((d) => (d.id === 'x' ? { ...d, kind: 'activate_osro' } : d)),
    )
    expect(out.data).toMatchObject({ met: 1, unmatched: 2 })
    expect(out.data.unmatchedDecisions).toEqual([
      { id: 'd1', party: 'Downstream water utility' },
      { id: 'd2', party: 'National Response Center' },
    ])
  })

  it('takes its list settings as comma-separated text from a toolkit', () => {
    const out = run([due('n-nrc', 30, 'NRC')], [notify('d1', 10, { who: 'nrc' })], {
      partyFields: 'who, also_notified',
    })
    expect(out.data).toMatchObject({ met: 1 })
  })
})
