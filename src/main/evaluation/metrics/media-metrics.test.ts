// Media environment metrics (spec 0458 FR-9) on worked examples.
import { describe, expect, it } from 'vitest'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { runMetric } from './registry'

const ev = (
  id: string,
  kind: string,
  time: string,
  attrs: Record<string, unknown> = {},
): GroundTruthEvent => ({
  id,
  kind,
  time,
  attrs,
})
const dec = (
  id: string,
  kind: string,
  time: string,
  fields: Record<string, unknown> = {},
): MetricDecision => ({
  id,
  kind,
  time,
  fields,
})
const summary = (r: ReturnType<typeof runMetric>, label: string): string =>
  r.summary.find((s) => s.label === label)?.value ?? '(missing)'

describe('holding_statement_time', () => {
  const events = [ev('s1', 'first_public_signal', '2026-11-04T14:00:00Z')]

  it('measures minutes from the first signal and checks the window', () => {
    const decisions = [
      dec('d1', 'issue_holding_statement', '2026-11-04T14:42:00Z', { channel: 'Website' }),
    ]
    const r = runMetric(
      { id: 'holding_statement_time', config: { windowMin: 60 } },
      { events, decisions },
    )
    expect(summary(r, 'Time from first signal to first holding statement')).toBe('42 min')
    expect(summary(r, 'Within the window')).toBe('Yes')
    const late = runMetric(
      { id: 'holding_statement_time', config: { windowMin: 30 } },
      { events, decisions },
    )
    expect(summary(late, 'Within the window')).toBe('No')
  })

  it('reports the time without a verdict when no window is set, and n/a with no statement', () => {
    const decisions = [dec('d1', 'issue_holding_statement', '2026-11-04T15:30:00Z')]
    const noWindow = runMetric(
      { id: 'holding_statement_time', config: { windowMin: 0 } },
      { events, decisions },
    )
    expect(summary(noWindow, 'Time from first signal to first holding statement')).toBe('90 min')
    expect(summary(noWindow, 'Within the window')).toBe('n/a')
    const none = runMetric({ id: 'holding_statement_time', config: {} }, { events, decisions: [] })
    expect(summary(none, 'Time from first signal to first holding statement')).toBe('n/a')
  })

  it('ignores a statement made before the first signal', () => {
    const decisions = [dec('d0', 'issue_holding_statement', '2026-11-04T13:00:00Z')]
    const r = runMetric({ id: 'holding_statement_time', config: {} }, { events, decisions })
    expect(summary(r, 'Time from first signal to first holding statement')).toBe('n/a')
  })
})

describe('statement_accuracy', () => {
  it('counts only confirmed checks and ignores claims not on the fact sheet in the ratio', () => {
    const r = runMetric(
      { id: 'statement_accuracy', config: {} },
      {
        checks: [
          {
            statementId: 'S1',
            claim: 'Server isolated at 7:35',
            factLabel: 'Isolation time',
            status: 'accurate',
          },
          {
            statementId: 'S1',
            claim: 'No customer data taken',
            factLabel: 'Data scope',
            status: 'inaccurate',
          },
          { statementId: 'S1', claim: 'Police notified', factLabel: '', status: 'unverifiable' },
          {
            statementId: 'S2',
            claim: 'Plants closed',
            factLabel: 'Operations',
            status: 'inaccurate',
            suggested: true,
          },
        ],
      },
    )
    expect(summary(r, 'Accuracy (accurate / checkable)')).toBe('0.500')
    expect(summary(r, 'Inaccurate claims')).toBe('1')
    expect(r.caveats.join(' ')).toMatch(/1 model-suggested/)
  })
})

describe('corrections', () => {
  const events = [
    ev('e1', 'error_found', '2026-11-04T18:00:00Z', { channel: 'Social media' }),
    ev('e2', 'error_found', '2026-11-04T19:00:00Z'),
  ]

  it('matches by error id, then by order, and reports time and channel', () => {
    const decisions = [
      dec('c1', 'issue_correction', '2026-11-04T18:25:00Z', {
        error: 'e1',
        channel: 'Social media',
      }),
    ]
    const r = runMetric({ id: 'corrections', config: {} }, { events, decisions })
    expect(summary(r, 'Errors corrected')).toBe('1 of 2')
    expect(summary(r, 'Mean time from discovery to correction')).toBe('25 min')
    expect(summary(r, 'Corrections on the channel the error spread on')).toBe('1 of 1')
    expect(summary(r, 'Errors never corrected')).toBe('1')
  })

  it('flags a correction on the wrong channel', () => {
    const decisions = [
      dec('c1', 'issue_correction', '2026-11-04T18:10:00Z', { error: 'e1', channel: 'Website' }),
    ]
    const r = runMetric({ id: 'corrections', config: {} }, { events, decisions })
    expect(summary(r, 'Corrections on the channel the error spread on')).toBe('0 of 1')
  })
})

describe('reporter_handling', () => {
  const events = [
    ev('q1', 'reporter_query', '2026-11-04T15:00:00Z', { deadline: '2026-11-04T16:00:00Z' }),
    ev('q2', 'reporter_query', '2026-11-04T15:10:00Z', { deadline: '2026-11-04T15:40:00Z' }),
    ev('q3', 'reporter_query', '2026-11-04T15:20:00Z', { deadline: '2026-11-04T17:00:00Z' }),
  ]
  const decisions = [
    dec('r1', 'respond_to_reporter', '2026-11-04T15:30:00Z', {
      inquiry: 'q1',
      response_mode: 'On the record',
    }),
    dec('r2', 'respond_to_reporter', '2026-11-04T15:55:00Z', {
      inquiry: 'q2',
      response_mode: 'No comment',
    }),
  ]

  it('counts answered, before deadline and the response modes', () => {
    const r = runMetric({ id: 'reporter_handling', config: {} }, { events, decisions })
    expect(summary(r, 'Queries answered')).toBe('2 of 3')
    expect(summary(r, 'Answered before the stated deadline')).toBe('1 of 3')
    expect(summary(r, 'No comment')).toBe('1')
    expect(summary(r, 'On the record')).toBe('1')
  })
})

describe('verification', () => {
  const events = [
    ev('v1', 'verification_item', '2026-11-04T17:00:00Z', { truth: 'misattributed' }),
    ev('v2', 'verification_item', '2026-11-04T17:05:00Z', { truth: 'authentic' }),
    ev('v3', 'verification_item', '2026-11-04T17:10:00Z', { truth: 'manipulated' }),
  ]

  it('scores a false item published, a false item held and a correct verdict', () => {
    const decisions = [
      dec('k1', 'request_clue', '2026-11-04T17:04:00Z', {
        item: 'v1',
        clue_kind: 'Reverse image result',
      }),
      dec('h1', 'hold_or_publish', '2026-11-04T17:20:00Z', {
        item: 'v1',
        verdict: 'Verified',
        confidence: 'High',
        action: 'Publish',
      }),
      dec('h2', 'hold_or_publish', '2026-11-04T17:25:00Z', {
        item: 'v2',
        verdict: 'Verified',
        confidence: 'Medium',
        action: 'Publish with caveat',
      }),
      dec('h3', 'hold_or_publish', '2026-11-04T17:30:00Z', {
        item: 'v3',
        verdict: 'False',
        confidence: 'Medium',
        action: 'Hold',
      }),
    ]
    const r = runMetric({ id: 'verification', config: {} }, { events, decisions })
    expect(summary(r, 'Items published')).toBe('2')
    expect(summary(r, 'False items published')).toBe('1 of 2')
    expect(summary(r, 'False items correctly held')).toBe('1 of 2')
    expect(summary(r, 'Verdicts that matched the ground truth')).toBe('2 of 3')
    expect(summary(r, 'Wrong verdicts held with high confidence')).toBe('1')
    expect(summary(r, 'Mean time from receipt to verdict')).toBe('20 min')
    // Both published items have a verdict recorded, so both have a verification step.
    expect(summary(r, 'Published items with a recorded verification step')).toMatch(/^2 of 2/)
  })

  it('treats an item with no decision as neither published nor held', () => {
    const r = runMetric({ id: 'verification', config: {} }, { events, decisions: [] })
    expect(summary(r, 'Items published')).toBe('0')
    expect(summary(r, 'False items published')).toBe('0 of 2')
    expect(summary(r, 'Published items with a recorded verification step')).toBe('n/a')
  })
})
