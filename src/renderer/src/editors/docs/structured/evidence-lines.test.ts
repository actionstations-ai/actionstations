import { describe, expect, it } from 'vitest'
import type { ExerciseRecord } from '@shared/schemas/aar'
import { resolveEvidence } from './evidence-lines'

const record: ExerciseRecord = {
  sources: { facilitator: true, evaluation: true, live: true, surveys: true },
  delivered: [],
  notes: [
    { ref: 'note:general', text: 'PIO joined late.' },
    { ref: 'note:I-06', rowId: 'I-06', text: 'FIDS stayed on.' },
  ],
  hotwash: [
    {
      ref: 'hw:h1',
      kind: 'improvement',
      text: 'One voice on the PA.',
      rowId: 'I-06',
      plusOnes: 3,
      promoted: true,
    },
  ],
  decisions: [
    { ref: 'dec:d1', exerciseTime: '1:20', rowId: 'I-06', text: 'Go dark.', byRole: 'IC' },
  ],
  observations: [
    {
      ref: 'obs:O-1',
      id: 'O-1',
      at: '2026-10-28T14:00:00.000Z',
      exerciseTime: '1:15',
      rowId: 'I-06',
      taskId: 'T-07',
      rating: 'partial',
      note: 'PA silenced after 12 minutes.',
      evaluator: 'Evaluator 2',
      source: 'live',
    },
  ],
  votes: [
    {
      ref: 'vote:v1',
      rowId: 'I-09',
      question: 'Go dark now?',
      options: [
        { label: 'Yes', count: 9 },
        { label: 'No', count: 4 },
      ],
    },
  ],
  messages: [
    {
      ref: 'msg:m1',
      exerciseTime: '1:19',
      fromRole: 'PIO',
      toRole: 'SimCell',
      text: 'Investigating.',
      pinned: true,
    },
  ],
  messageCounts: [],
  surveys: [
    {
      surveyId: 'SV1',
      title: 'Participant Feedback',
      kind: 'participant_feedback',
      responses: 5,
      byChannel: { paper: 5 },
      byRoleGroup: {},
      minResponses: 3,
      questions: [
        {
          questionId: 'q1',
          text: 'The exercise was well structured',
          type: 'rating',
          n: 5,
          mean: 4.2,
          suppressed: false,
        },
        { questionId: 'q9', text: 'What would you change?', type: 'text', n: 2, suppressed: true },
      ],
      pairs: [],
      knowledge: [],
      suppressed: false,
    },
  ],
  warnings: [],
}

describe('resolveEvidence (#419)', () => {
  it('reads every kind of ref to a line with role labels only', () => {
    expect(resolveEvidence(record, 'note:general')).toMatchObject({
      kind: 'Note',
      meta: 'General notes',
    })
    expect(resolveEvidence(record, 'note:I-06')).toMatchObject({
      meta: 'I-06',
      text: 'FIDS stayed on.',
    })
    expect(resolveEvidence(record, 'obs:O-1')).toMatchObject({
      kind: 'Observation',
      meta: 'I-06 · T-07 · 1:15 · Evaluator 2',
      text: 'Partial — PA silenced after 12 minutes.',
    })
    expect(resolveEvidence(record, 'hw:h1')).toMatchObject({
      kind: 'Hot wash: To improve',
      meta: 'I-06 · +3',
    })
    expect(resolveEvidence(record, 'dec:d1')).toMatchObject({
      kind: 'Decision',
      meta: '1:20 · I-06 · IC',
    })
    expect(resolveEvidence(record, 'vote:v1')?.text).toBe('Go dark now? — Yes: 9, No: 4')
    expect(resolveEvidence(record, 'msg:m1')).toMatchObject({
      kind: 'Message (pinned)',
      meta: '1:19 · PIO → SimCell',
    })
  })

  it('reads survey refs to the survey or the question, with suppressed detail hidden', () => {
    expect(resolveEvidence(record, 'survey:SV1')).toMatchObject({
      kind: 'Survey',
      meta: '5 responses',
    })
    expect(resolveEvidence(record, 'survey:SV1:q1')?.meta).toBe(
      'Participant Feedback · mean 4.2 of 5',
    )
    expect(resolveEvidence(record, 'survey:SV1:q9')?.meta).toContain('too few to show detail')
  })

  it('reads tracker, clock and transcript refs to lines (#428, #426, #425)', () => {
    const withLines = {
      ...record,
      tracker: [{ ref: 'trk:U-I-09', meta: 'I-09', text: 'No response was recorded to I-09' }],
      clocks: [{ ref: 'clk:K1', meta: 'CIRCIA', text: '72-hour report: Missed' }],
      transcripts: [{ ref: 'tr:T1', meta: 'Hot wash · 15:30', text: 'We never confirmed it.' }],
    }
    expect(resolveEvidence(withLines, 'trk:U-I-09')).toMatchObject({
      kind: 'Tracker',
      meta: 'I-09',
    })
    expect(resolveEvidence(withLines, 'clk:K1')).toMatchObject({ kind: 'Regulatory clock' })
    expect(resolveEvidence(withLines, 'tr:T1')).toMatchObject({
      kind: 'Hot wash recording',
      text: 'We never confirmed it.',
    })
    expect(resolveEvidence(record, 'clk:K1')).toBeUndefined()
  })

  it('returns nothing for a ref the record no longer holds', () => {
    expect(resolveEvidence(record, 'note:I-99')).toBeUndefined()
    expect(resolveEvidence(record, 'survey:SV9')).toBeUndefined()
    expect(resolveEvidence(record, 'log:12')).toBeUndefined()
  })
})
