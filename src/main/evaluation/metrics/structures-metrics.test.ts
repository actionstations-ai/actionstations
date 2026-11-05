// Worked examples for the structures metrics (#856, spec 0471 FR-10).
import { describe, expect, it } from 'vitest'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { registerStructuresMetrics } from '../../toolkits/structures/register'
import {
  computeStructuresPlacardAgreement,
  StructuresPlacardAgreementConfig,
} from './structures-placard-agreement'
import { computeStructuresReporting, StructuresReportingConfig } from './structures-reporting'
import {
  computeStructuresRescueTimeline,
  StructuresRescueTimelineConfig,
} from './structures-rescue-timeline'
import {
  computeStructuresWarningToAction,
  StructuresWarningToActionConfig,
} from './structures-warning-to-action'
import { runMetric } from './registry'

const T0 = Date.parse('2026-11-09T12:00:00Z')
const at = (min: number): string => new Date(T0 + min * 60_000).toISOString()
const field = (out: { summary: { label: string; value: string }[] }, label: string) =>
  out.summary.find((s) => s.label.startsWith(label))?.value
const event = (
  id: string,
  min: number,
  kind: string,
  attrs: Record<string, unknown> = {},
): GroundTruthEvent => ({
  id,
  time: at(min),
  kind,
  attrs,
})
const decision = (
  id: string,
  min: number,
  kind: string,
  fields: Record<string, unknown> = {},
): MetricDecision => ({
  id,
  time: at(min),
  kind,
  fields,
})

describe('warning to action', () => {
  const events = [
    event('onset', 40, 'failure_onset'),
    event('alarm', 10, 'threshold_crossing', { level: 'alarm' }),
    event('action', 25, 'threshold_crossing', { level: 'action' }),
  ]
  const config = StructuresWarningToActionConfig.parse({})

  it('measures 7 minutes from the first alarm to stop work, and work stopped before the failure', () => {
    const out = computeStructuresWarningToAction(
      {
        events,
        decisions: [
          decision('s', 17, 'structures_stop_work'),
          decision('e', 22, 'structures_evacuate'),
        ],
      },
      config,
    )
    expect(field(out, 'Minutes from first sign to stop work')).toBe('7 min')
    expect(field(out, 'Minutes from first sign to evacuation')).toBe('12 min')
    expect(field(out, 'Work stopped before the failure began')).toBe('yes')
  })

  it('reports no stop and a late stop plainly', () => {
    const none = computeStructuresWarningToAction({ events, decisions: [] }, config)
    expect(field(none, 'Minutes from first sign to stop work')).toBe('n/a')
    const late = computeStructuresWarningToAction(
      { events, decisions: [decision('s', 55, 'structures_stop_work')] },
      config,
    )
    expect(field(late, 'Work stopped before the failure began')).toBe('no')
  })

  it('can read the action level as the first sign and shows a negative time as acting early', () => {
    const out = computeStructuresWarningToAction(
      { events, decisions: [decision('s', 20, 'structures_stop_work')] },
      StructuresWarningToActionConfig.parse({ signLevel: 'action' }),
    )
    expect(field(out, 'Minutes from first sign to stop work')).toBe('-5 min')
  })
})

describe('reporting timeliness', () => {
  const events = [
    event('r', 30, 'reportable_event', { eventType: 'Work-related fatality', clockHours: 8 }),
  ]
  const notify = (id: string, min: number, who: string) =>
    decision(id, min, 'structures_notify', { who })

  it('scores the OSHA report against the 8 hour fatality clock', () => {
    const ok = computeStructuresReporting(
      { events, decisions: [notify('a', 30 + 7 * 60, 'osha')] },
      StructuresReportingConfig.parse({}),
    )
    expect(field(ok, 'OSHA report')).toBe('on time')
    const late = computeStructuresReporting(
      { events, decisions: [notify('a', 30 + 9 * 60, 'osha')] },
      StructuresReportingConfig.parse({}),
    )
    expect(field(late, 'OSHA report')).toBe('late')
    expect(
      field(
        computeStructuresReporting({ events, decisions: [] }, StructuresReportingConfig.parse({})),
        'OSHA report',
      ),
    ).toBe('not made')
  })

  it('uses 24 hours for a hospitalization, and shows owner notice without a target as told', () => {
    const e = [event('r', 0, 'reportable_event', { eventType: 'In-patient hospitalization' })]
    const out = computeStructuresReporting(
      { events: e, decisions: [notify('a', 20 * 60, 'OSHA'), notify('o', 90, 'Owner')] },
      StructuresReportingConfig.parse({}),
    )
    expect(field(out, 'OSHA report')).toBe('on time')
    expect(field(out, 'Owner told')).toBe('told (no target set)')
    const scored = computeStructuresReporting(
      { events: e, decisions: [notify('o', 90, 'Owner')] },
      StructuresReportingConfig.parse({ ownerTargetHours: 1 }),
    )
    expect(field(scored, 'Owner told')).toBe('late')
  })
})

describe('rescue timeline', () => {
  const events = [
    event('c', 0, 'collapse'),
    event('f', 9, 'first_responders_on_scene'),
    event('h1', 20, 'secondary_hazard', { hazard: 'Gas leak', controlledBy: 'structures_shutoff' }),
    event('h2', 25, 'secondary_hazard', { hazard: 'Fire', controlledBy: 'structures_fire_watch' }),
  ]
  it('times the calls from the collapse and counts hazards controlled in time', () => {
    const out = computeStructuresRescueTimeline(
      {
        events,
        decisions: [
          decision('a', 2, 'structures_call_911'),
          decision('b', 6, 'structures_exclusion_zone'),
          decision('c', 14, 'structures_shore'),
          decision('d', 35, 'structures_shutoff'),
        ],
      },
      StructuresRescueTimelineConfig.parse({}),
    )
    expect(field(out, 'Minutes from collapse to the 911 call')).toBe('2 min')
    expect(field(out, 'Minutes from collapse to the exclusion zone')).toBe('6 min')
    expect(field(out, 'Minutes from collapse to the shoring request')).toBe('14 min')
    expect(field(out, 'Minutes from the 911 call to first responders')).toBe('7 min')
    expect(field(out, 'Secondary hazards controlled in time')).toBe('1 of 2')
  })
})

describe('placard agreement', () => {
  /** 30 buildings: 20 INSPECTED, 6 RESTRICTED USE, 4 UNSAFE; 3 priority, evaluated first. */
  const truthOf = (i: number): string =>
    i < 20 ? 'INSPECTED' : i < 26 ? 'RESTRICTED USE' : 'UNSAFE'
  const events = Array.from({ length: 30 }, (_, i) =>
    event(`t${i}`, 0, 'building_truth', {
      buildingId: `B-${i}`,
      truthPlacard: truthOf(i),
      priority: i < 3 ? 'hospital' : 'other',
    }),
  )
  const slug = (p: string): string => p.toLowerCase().replace(/ /g, '_')

  it('agrees on 24 of 30 buildings and tabulates the six disagreements by category', () => {
    const wrong = new Map<number, string>([
      [2, 'RESTRICTED USE'], // truth INSPECTED, over-restricted
      [5, 'UNSAFE'], // INSPECTED, over
      [21, 'INSPECTED'], // RESTRICTED, under
      [22, 'INSPECTED'], // RESTRICTED, under
      [27, 'RESTRICTED USE'], // UNSAFE, under
      [28, 'RESTRICTED USE'], // UNSAFE, under
    ])
    const decisions = Array.from({ length: 30 }, (_, i) =>
      decision(`d${i}`, 5 + i, 'structures_post_placard', {
        building: `B-${i}`,
        placard: slug(wrong.get(i) ?? truthOf(i)),
        team: i % 2 ? 'Team 2' : 'Team 1',
      }),
    )
    const out = computeStructuresPlacardAgreement(
      { events, decisions },
      StructuresPlacardAgreementConfig.parse({}),
    )
    expect(field(out, 'Buildings evaluated')).toBe('30 of 30')
    expect(field(out, 'Placards in agreement')).toBe('24 of 30')
    expect(field(out, 'Share in agreement')).toBe('0.800')
    expect(field(out, 'Under-restricted')).toBe('4')
    expect(field(out, 'Over-restricted')).toBe('2')
    expect(field(out, 'Priority buildings evaluated before any other building')).toBe('3 of 3')
    const table = out.tables[0]!
    expect(table.rows[0]).toEqual(['truth INSPECTED', '18', '1', '1', '0'])
    expect(table.rows[1]).toEqual(['truth RESTRICTED USE', '2', '4', '0', '0'])
    expect(table.rows[2]).toEqual(['truth UNSAFE', '0', '2', '2', '0'])
  })

  it('counts buildings not yet evaluated, a building placarded two ways and priority order', () => {
    const decisions = [
      decision('x1', 5, 'structures_post_placard', { building: 'B-10', placard: 'inspected' }),
      decision('x2', 9, 'structures_post_placard', { building: 'B-10', placard: 'restricted_use' }),
      decision('x3', 12, 'structures_post_placard', { building: 'B-0', placard: 'inspected' }),
    ]
    const out = computeStructuresPlacardAgreement(
      { events, decisions },
      StructuresPlacardAgreementConfig.parse({}),
    )
    expect(field(out, 'Buildings evaluated')).toBe('2 of 30')
    expect(field(out, 'Buildings placarded two ways')).toBe('1')
    expect(field(out, 'Priority buildings evaluated before any other building')).toBe('0 of 3')
    expect(out.tables[0]!.rows[0]![4]).toBe('18')
  })
})

describe('registration', () => {
  it('runs the four metrics through the registry with the bag the app builds', () => {
    registerStructuresMetrics()
    registerStructuresMetrics()
    const out = runMetric(
      { id: 'structures_warning_to_action', config: {} },
      {
        events: [event('a', 0, 'threshold_crossing', { level: 'alarm' })],
        decisions: [decision('s', 3, 'structures_stop_work')],
      },
    )
    expect(field(out, 'Minutes from first sign to stop work')).toBe('3 min')
  })
})
