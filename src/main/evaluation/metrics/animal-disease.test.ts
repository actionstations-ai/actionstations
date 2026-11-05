// Worked examples for the animal disease metrics (#865, spec 0460 FR-11).
import { describe, expect, it } from 'vitest'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  computeContinuity,
  computeDepopTiming,
  computeDisposalBacklog,
  computeSurveillance,
  ContinuityConfig,
  DepopTimingConfig,
  DisposalBacklogConfig,
  SurveillanceConfig,
} from './animal-disease'

const T0 = Date.parse('2026-10-21T15:00:00Z')
const at = (hours: number): string => new Date(T0 + hours * 3_600_000).toISOString()
const event = (
  id: string,
  kind: string,
  hours: number,
  attrs: Record<string, unknown> = {},
): GroundTruthEvent => ({
  id,
  kind,
  time: at(hours),
  attrs: { premises: id, ...attrs },
})
const decision = (
  kind: string,
  premises: string,
  hours: number,
  fields: Record<string, unknown> = {},
): MetricDecision => ({
  id: `${kind}-${premises}-${hours}`,
  kind,
  time: at(hours),
  fields: { premises, ...fields },
})
const value = (out: { summary: { label: string; value: string }[] }, label: string) =>
  out.summary.find((s) => s.label.startsWith(label))?.value

describe('depopulation timing', () => {
  const events = [
    event('P-1', 'presumptive_positive', 0),
    event('P-2', 'presumptive_positive', 2),
    event('P-3', 'presumptive_positive', 4),
    event('P-4', 'presumptive_positive', 6),
  ]
  const decisions = [
    decision('animal_record_depopulation', 'P-1', 24),
    decision('animal_record_depopulation', 'P-2', 26.01),
    decision('animal_record_depopulation', 'P-3', 10),
  ]

  it('counts premises within the 24 hour goal, late and still open, with 24 hours exactly on time', () => {
    const out = computeDepopTiming({ events, decisions }, DepopTimingConfig.parse({}))
    expect(out.data).toMatchObject({ premises: 4, withinGoal: 2, late: 1, open: 1 })
    expect(out.data.shareWithinGoal).toBe(0.5)
    expect(value(out, 'Depopulated within goal')).toBe('2 of 4')
    expect(out.data.longestMinutes).toBeCloseTo(24.01 * 60, 0)
    expect(out.inputs[1]!.value).toMatch(/24 h/)
  })

  it('uses the latest completion per premises and honors a changed goal', () => {
    const out = computeDepopTiming(
      { events, decisions: [...decisions, decision('animal_record_depopulation', 'P-2', 30)] },
      DepopTimingConfig.parse({ goalHours: 36 }),
    )
    expect(out.data).toMatchObject({ withinGoal: 3, late: 0, open: 1 })
  })

  it('says so when nothing was scored', () => {
    const out = computeDepopTiming({ events: [], decisions: [] }, DepopTimingConfig.parse({}))
    expect(out.data.shareWithinGoal).toBeNull()
    expect(out.caveats.join(' ')).toMatch(/No presumptive/)
  })
})

describe('surveillance on schedule', () => {
  const events = [
    event('P-1', 'sampling_due', 24, { designation: 'contact' }),
    event('P-2', 'sampling_due', 24, { designation: 'at-risk' }),
    event('P-3', 'sampling_due', 24, { designation: 'at-risk' }),
  ]
  it('counts on schedule, late and not sampled, using the first sample taken', () => {
    const out = computeSurveillance(
      {
        events,
        decisions: [
          decision('animal_record_sample', 'P-1', 23),
          decision('animal_record_sample', 'P-2', 30),
          decision('animal_record_sample', 'P-1', 40),
        ],
      },
      SurveillanceConfig.parse({}),
    )
    expect(out.data).toMatchObject({ due: 3, onSchedule: 1, late: 1, notSampled: 1 })
    expect(value(out, 'Share on schedule')).toBe('0.333')
  })

  it('allows a grace period', () => {
    const out = computeSurveillance(
      { events, decisions: [decision('animal_record_sample', 'P-2', 24.5)] },
      SurveillanceConfig.parse({ graceMinutes: 45 }),
    )
    expect(out.data.onSchedule).toBe(1)
  })
})

describe('continuity of business', () => {
  const events = [
    event('P-1', 'permit_request', 0, { unaffected: true }),
    event('P-2', 'permit_request', 0, { unaffected: true }),
    event('P-3', 'permit_request', 0, { unaffected: true }),
    event('P-4', 'permit_request', 0, { unaffected: false }),
  ]
  it('measures decisions inside the service target and unaffected premises able to move', () => {
    const out = computeContinuity(
      {
        events,
        decisions: [
          decision('animal_movement_permit_decision', 'P-1', 6, { decision: 'issue' }),
          decision('animal_movement_permit_decision', 'P-2', 30, { decision: 'deny' }),
          decision('animal_movement_permit_decision', 'P-4', 24, {
            decision: 'issue_with_conditions',
          }),
        ],
      },
      ContinuityConfig.parse({ serviceTargetHours: 24 }),
    )
    expect(out.data).toMatchObject({
      requests: 4,
      unaffected: 3,
      decidedOnTime: 2,
      noDecision: 1,
      ableToMove: 1,
    })
    expect(out.data.shareAbleToMove).toBeCloseTo(1 / 3, 10)
    expect(out.caveats.join(' ')).toMatch(/Denying a permit can be the right decision/)
  })
})

describe('disposal backlog', () => {
  const events = [
    event('P-1', 'depop_complete', 10, { head: 40000 }),
    event('P-2', 'depop_complete', 12, { head: 12000 }),
    event('P-3', 'depop_complete', 14, { head: 800 }),
  ]
  it('counts sites chosen in time, late and head still waiting', () => {
    const out = computeDisposalBacklog(
      {
        events,
        decisions: [
          decision('animal_choose_disposal_site', 'P-1', 20, { site: 'Disposal Site 2' }),
          decision('animal_choose_disposal_site', 'P-2', 30, { site: 'Disposal Site 1' }),
        ],
      },
      DisposalBacklogConfig.parse({ maxWaitHours: 12 }),
    )
    expect(out.data).toMatchObject({
      inTime: 1,
      late: 1,
      waiting: 1,
      waitingHead: 800,
      lateHead: 12000,
    })
  })
})
