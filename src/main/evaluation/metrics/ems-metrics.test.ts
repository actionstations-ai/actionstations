// EMS, fire and hazmat metrics (spec 0456 FR-11, Testing): worked examples with the numbers the
// spec names (triage complete in 17 minutes, 3 of 5 Immediate patients to the trauma center,
// protective action 6 minutes before the plume), a run over the simulated incident, and the
// lint rule that backs the guidebook labeling.
import { describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { isMetricId, runMetric } from './registry'
import { fieldLintIssues, fieldLintRuleIds } from '../../toolkits/lint-rules'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const ev = (
  id: string,
  time: string,
  kind: string,
  attrs: Record<string, unknown> = {},
): GroundTruthEvent => ({
  id,
  time,
  kind,
  attrs,
})
const dec = (
  id: string,
  time: string,
  kind: string,
  fields: Record<string, unknown>,
): MetricDecision => ({
  id,
  time,
  kind,
  fields,
})
const summary = (r: ReturnType<typeof runMetric>, label: string): string =>
  r.summary.find((s) => s.label === label)?.value ?? '(missing)'

describe('registered', () => {
  it('knows the four metrics', () => {
    for (const id of [
      'triage_completion',
      'destination_fit',
      'protective_action_distance',
      'accountability',
    ])
      expect(isMetricId(id)).toBe(true)
  })
})

describe('triage_completion', () => {
  const events = [
    ev('first', '2026-10-21T10:19:00Z', 'first_unit_on_scene'),
    ev('done', '2026-10-21T10:34:00Z', 'triage_complete'),
    ev('T-1', '2026-10-21T10:25:00Z', 'patient', { priority: 'Immediate' }),
    ev('T-2', '2026-10-21T10:30:00Z', 'patient', { priority: 'Minor' }),
  ]
  const decisions = [
    dec('d1', '2026-10-21T10:36:00Z', 'report_triage_complete', {
      immediate: 1,
      delayed: 0,
      minor: 1,
      expectant: 0,
    }),
  ]
  const r = runMetric({ id: 'triage_completion', config: {} }, { events, decisions })
  it('measures from the first unit to the report, against the simulated time', () => {
    expect(summary(r, 'Time to triage complete (players)')).toBe('17 min')
    expect(summary(r, 'Time to triage complete (simulated incident)')).toBe('15 min')
    expect(summary(r, 'Difference (players minus simulated)')).toBe('2 min')
  })
  it('shows the counts it compared', () => {
    expect(r.tables[0]!.rows[0]).toEqual(['Immediate', '1', '1'])
  })
  it('says n/a and why when no report was made', () => {
    const none = runMetric({ id: 'triage_completion', config: {} }, { events, decisions: [] })
    expect(summary(none, 'Time to triage complete (players)')).toBe('n/a')
    expect(none.caveats.join(' ')).toMatch(/No "triage complete" report/)
  })
})

describe('destination_fit', () => {
  const hospitals = ['Rook County Trauma Center', 'Mercy Community Hospital']
  const patients = Array.from({ length: 5 }, (_, i) =>
    ev(`T-${i + 1}`, '2026-10-21T10:25:00Z', 'patient', {
      tag: `T-${i + 1}`,
      priority: 'Immediate',
      appropriate: [hospitals[0]],
      best: hospitals[0],
    }),
  )
  const events = [
    ...patients,
    ev(hospitals[0]!, '2026-10-21T10:11:00Z', 'hospital', { name: hospitals[0], limit: 2 }),
  ]
  const decisions = [1, 2, 3, 4, 5].map((n) =>
    dec(`d${n}`, '2026-10-21T10:40:00Z', 'assign_patient_destination', {
      tag_number: `T-${n}`,
      hospital: n <= 3 ? 'Rook County Trauma Center' : 'Mercy Community Hospital',
    }),
  )
  const r = runMetric({ id: 'destination_fit', config: {} }, { events, decisions })
  it('counts 3 of 5 Immediate patients sent to the trauma center', () => {
    expect(summary(r, 'Immediate patients sent to a capable hospital')).toBe('3 of 5')
    expect(summary(r, 'Patients sent to a capable hospital')).toBe('3 of 5')
    expect(summary(r, 'Share sent to a capable hospital')).toBe('0.600')
  })
  it('flags a hospital sent more than it said it could take', () => {
    expect(summary(r, 'Hospitals sent more than their stated limit')).toBe(
      'Rook County Trauma Center',
    )
  })
  it('matches hospital names ignoring case and punctuation', () => {
    const loose = runMetric(
      { id: 'destination_fit', config: {} },
      {
        events,
        decisions: [
          dec('x', '2026-10-21T10:40:00Z', 'assign_patient_destination', {
            tag_number: 't1',
            hospital: 'rook county trauma center',
          }),
        ],
      },
    )
    expect(summary(loose, 'Patients sent to a capable hospital')).toBe('1 of 1')
  })
  it('lists patients with no destination', () => {
    const none = runMetric({ id: 'destination_fit', config: {} }, { events, decisions: [] })
    expect(summary(none, 'Patients with no destination assigned')).toBe('5')
  })
})

describe('protective_action_distance', () => {
  const events = [
    ev('zone', '2026-10-21T11:00:00Z', 'release_zone', {
      isolationDistance: 300,
      protectiveDistance: 1500,
      unit: 'ft',
      distanceSource: 'invented exercise values',
    }),
    ev('school-0', '2026-10-21T11:12:00Z', 'plume_arrival', { place: 'Elm Street school' }),
    ev('clinic-1', '2026-10-21T11:03:00Z', 'plume_arrival', { place: 'Mill Street clinic' }),
  ]
  const decisions = [
    dec('d1', '2026-10-21T11:06:00Z', 'set_protective_actions', {
      action: 'Shelter in place',
      isolation_distance: 90,
      protective_distance: 457,
      unit: 'm',
      distance_source: 'Invented exercise values for a fictional material',
    }),
  ]
  const r = runMetric({ id: 'protective_action_distance', config: {} }, { events, decisions })
  it('puts the action in place 6 minutes before the plume reaches the school', () => {
    const school = r.tables[0]!.rows.find((x) => x[0] === 'Elm Street school')!
    expect(school[2]).toBe('6 min')
    expect(school[3]).toBe('Yes')
    expect(summary(r, 'Places with the action in place before the plume')).toBe('1 of 2')
  })
  it('checks the distances against the scenario in a common unit', () => {
    // 300 ft = 91.4 m and 1,500 ft = 457.2 m, so 90 m and 457 m are within 10 percent.
    expect(summary(r, 'Isolation distance')).toBe('Within tolerance')
    expect(summary(r, 'Protective action distance')).toBe('Within tolerance')
    const tight = runMetric(
      { id: 'protective_action_distance', config: { tolerancePercent: 0 } },
      { events, decisions },
    )
    expect(summary(tight, 'Isolation distance')).toBe('Outside tolerance')
  })
  it('names the sources of the distances', () => {
    expect(r.inputs.find((i) => i.label === 'Source of the scenario distances')?.value).toBe(
      'invented exercise values',
    )
    expect(r.caveats.join(' ')).toMatch(/own guidebook/)
  })
})

describe('accountability', () => {
  const events = [ev('m1', '2026-10-21T14:15:47Z', 'mayday')]
  const decisions = [
    dec('t1', '2026-10-21T14:21:00Z', 'transfer_command', {
      from: 'Engine 5',
      to: 'Battalion 1',
      briefing: 'Two companies inside, mayday active',
      announced: 'Command channel',
    }),
    dec('t2', '2026-10-21T14:40:00Z', 'transfer_command', {
      from: 'Battalion 1',
      to: 'Chief 1',
      briefing: '',
      announced: 'Not announced',
    }),
    dec('m', '2026-10-21T14:16:30Z', 'declare_mayday', {
      unit: 'Ladder 2',
      action: 'RIT deployed',
      par: 'Yes',
    }),
  ]
  const r = runMetric({ id: 'accountability', config: {} }, { events, decisions })
  it('counts briefed and announced transfers', () => {
    expect(summary(r, 'Transfers with a briefing')).toBe('1 of 2')
    expect(summary(r, 'Transfers announced')).toBe('1 of 2')
  })
  it('times the mayday response and the accountability report', () => {
    expect(summary(r, 'Maydays handled in time')).toBe('1 of 1')
    expect(summary(r, 'Maydays with an accountability report ordered')).toBe('1 of 1')
    expect(r.tables[1]!.rows[0]![3]).toBe('0.7 min')
  })
})

describe('erg_distance_untabled field lint', () => {
  it('is registered and runs on the protective action order', () => {
    expect(fieldLintRuleIds()).toContain('erg_distance_untabled')
    const issues = fieldLintIssues('protective_action_order', {
      area: 'Isolate 800 meters around the car holding UN1789.',
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toMatch(/UN1789/)
  })
  it('leaves a fictional material and other inject types alone', () => {
    expect(
      fieldLintIssues('protective_action_order', {
        area: 'Exercise material X-17: isolate 300 ft (invented).',
      }),
    ).toEqual([])
    expect(fieldLintIssues('tweet', { text: 'UN1789, 800 meters' })).toEqual([])
  })
})
