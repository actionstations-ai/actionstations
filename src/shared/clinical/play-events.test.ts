// Clinical events from play (issue #1131): what the controller's log and the players' forms
// record becomes events, communications answer the critical results they name, and decision
// times move onto the case clock.
import { describe, expect, it } from 'vitest'
import type { GroundTruthEvent, MetricDecision } from '../schemas/metrics'
import {
  eventsFromDecisions,
  exerciseMinutes,
  namesResult,
  onCaseClock,
  withCommunications,
} from './play-events'

const d = (id: string, kind: string, time: string, fields: Record<string, unknown>) =>
  ({ id, kind, time, fields }) as MetricDecision

describe('eventsFromDecisions', () => {
  it('turns unit reports and the controller logs into the events the measures read', () => {
    const out = eventsFromDecisions([
      d('a', 'report_unit_on_downtime', '2026-01-01T00:10:00Z', { unit: '4 West' }),
      d('b', 'log_systems_event', '2026-01-01T00:20:00Z', {
        event: 'order_or_result_lost',
        message_class: 'Orders',
        count: 4,
      }),
      d('c', 'log_clinical_event', '2026-01-01T00:30:00Z', {
        event: 'evacuation_priority_key',
        expected: '1. Bed 3\n2. Bed 1 and Bed 2',
      }),
      d('e', 'log_clinical_event', '2026-01-01T00:40:00Z', {
        event: 'infection_case_found',
        patient: '412',
        expected: 'Single room isolation',
        precautions: 'Contact plus',
      }),
      d('f', 'log_clinical_event', '2026-01-01T00:50:00Z', { event: 'not_a_choice' }),
    ])
    expect(out.map((e) => [e.kind, e.area, e.attrs])).toEqual([
      ['unit_on_downtime', '4 West', { logged: true }],
      [
        'order_result_record',
        undefined,
        { logged: true, messageClass: 'Orders', outcome: 'lost', count: 4 },
      ],
      ['evacuation_priority', undefined, { logged: true, order: ['Bed 3', 'Bed 1', 'Bed 2'] }],
      [
        'infection_case',
        undefined,
        {
          logged: true,
          room: '412',
          organism: '',
          expectedAction: 'Single room isolation',
          expectedPrecautions: 'Contact plus',
        },
      ],
    ])
  })
})

describe('critical result communications', () => {
  const result = (id: string, time: string): GroundTruthEvent => ({
    id,
    time,
    kind: 'critical_result',
    attrs: { patient: 'TESTPATIENT, Aster (MRN 10023456)', mrn: '10023456' },
  })

  it('matches a result by record number, given name, full name or id', () => {
    const e = result('CR1', '2026-01-01T00:00:00Z')
    for (const typed of ['10023456', 'aster', 'Aster in bed 4', 'TESTPATIENT, Aster', 'cr1'])
      expect(namesResult(typed, e), typed).toBe(true)
    expect(namesResult('Birch', e)).toBe(false)
    expect(namesResult('', e)).toBe(false)
  })

  it('answers each result with the earliest call after it, one call per result', () => {
    const out = withCommunications(
      [result('CR1', '2026-01-01T01:00:00Z'), result('CR2', '2026-01-01T02:00:00Z')],
      [
        d('early', 'communicate_critical_result', '2026-01-01T00:30:00Z', { patient: 'Aster' }),
        d('one', 'communicate_critical_result', '2026-01-01T01:20:00Z', { patient: 'Aster' }),
        d('two', 'communicate_critical_result', '2026-01-01T02:05:00Z', { patient: '10023456' }),
      ],
    )
    expect(out.map((e) => e.attrs.communicatedAt)).toEqual([
      '2026-01-01T01:20:00Z',
      '2026-01-01T02:05:00Z',
    ])
  })
})

describe('the case clock', () => {
  const mapping = { caseStart: '2026-11-12T02:00:00.000Z', startOffsetMin: 0, speed: 1, jumps: [] }

  it('reads exercise times', () => {
    expect(exerciseMinutes('1:05')).toBe(65)
    expect(exerciseMinutes('10:00')).toBe(600)
    expect(exerciseMinutes('soon')).toBeUndefined()
  })

  it('puts a decision at its time field, else its exercise time, else leaves it', () => {
    const out = onCaseClock(
      [
        { ...d('a', 'x', '2026-12-01T00:00:00Z', { time: '0:30' }), exerciseTime: '0:45' },
        { ...d('b', 'x', '2026-12-01T00:00:00Z', {}), exerciseTime: '1:00' },
        d('c', 'x', '2026-12-01T00:00:00Z', {}),
      ],
      mapping,
    )
    expect(out.map((x) => x.time)).toEqual([
      '2026-11-12T02:30:00.000Z',
      '2026-11-12T03:00:00.000Z',
      '2026-12-01T00:00:00Z',
    ])
    expect(onCaseClock(out, undefined)).toEqual(out)
  })
})
