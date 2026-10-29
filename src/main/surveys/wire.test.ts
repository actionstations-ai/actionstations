import { describe, expect, it } from 'vitest'
import { Survey } from '@shared/schemas'
import { fromWireResponse, toWireSurvey } from './wire'

const NOW = '2026-10-28T14:00:00.000Z'
const DELIVERY = 'AbCdEfGhIjKlMnOpQrStUv'
const survey = Survey.parse({
  id: 'KCHECK',
  title: 'Knowledge Check',
  kind: 'knowledge_check',
  introMd: 'Pick one answer each.',
  createdAt: NOW,
  updatedAt: NOW,
  sections: [
    {
      id: 's',
      questions: [
        {
          id: 'k1',
          type: 'choice',
          text: 'Who declares manual boarding?',
          required: true,
          options: [
            { id: 'a', text: 'Duty manager' },
            { id: 'b', text: 'Gate agent' },
          ],
          correctOptionId: 'a',
          citation: { documentId: 'tirp', documentTitle: 'TIRP', headingPath: 'TIRP › 13.7' },
        },
        { id: 'r1', type: 'rating', text: 'Clear' },
        {
          id: 'c1',
          type: 'confidence',
          text: 'Manual',
          statement: 'I could lead it',
          pairKey: 'm',
          edition: 'before',
          objectiveRef: 'OBJ1',
        },
        { id: 't1', type: 'text', text: 'Anything else?' },
      ],
    },
  ],
})

describe('toWireSurvey', () => {
  it('maps question types onto survey.open kinds and marks it anonymous', () => {
    const wire = toWireSurvey(survey, DELIVERY)
    expect(wire.surveyId).toBe(DELIVERY)
    expect(wire.anonymous).toBe(true)
    expect(wire.questions.map((q) => [q.id, q.kind])).toEqual([
      ['k1', 'single'],
      ['r1', 'scale'],
      ['c1', 'scale'],
      ['t1', 'text'],
    ])
    expect(wire.questions[1]).toMatchObject({ min: 1, max: 5 })
    expect(wire.questions[2]!.text).toBe('I could lead it')
  })

  it('never sends correct answers, citations or objective refs to a device', () => {
    const text = JSON.stringify(toWireSurvey(survey, DELIVERY))
    expect(text).not.toContain('correctOptionId')
    expect(text).not.toContain('TIRP')
    expect(text).not.toContain('OBJ1')
  })
})

describe('fromWireResponse', () => {
  const ctx = {
    deliveryId: DELIVERY,
    responseId: 'R1',
    channel: 'qr' as const,
    receivedAt: '2026-10-28T15:12:44.300Z',
  }
  const payload = (answers: unknown[]) => ({ surveyId: DELIVERY, answers })

  it('stores valid answers, rounded to the minute, ignoring unknown question ids', () => {
    const r = fromWireResponse(
      survey,
      payload([
        { questionId: 'k1', value: ['b'] },
        { questionId: 'r1', value: 9 },
        { questionId: 'ghost', value: 'x' },
      ]),
      ctx,
    )
    expect(r).toEqual({
      id: 'R1',
      surveyId: 'KCHECK',
      deliveryId: DELIVERY,
      channel: 'qr',
      at: '2026-10-28T15:12:00.000Z',
      answers: { k1: ['b'], r1: 5 },
      otherText: {},
    })
  })

  it('refuses a payload for another delivery or with nothing usable', () => {
    expect(fromWireResponse(survey, { ...payload([]), surveyId: 'x'.repeat(22) }, ctx)).toBeNull()
    expect(fromWireResponse(survey, payload([{ questionId: 'ghost', value: 1 }]), ctx)).toBeNull()
    expect(fromWireResponse(survey, { nonsense: true }, ctx)).toBeNull()
  })

  it('keeps nothing about the sender', () => {
    const r = fromWireResponse(
      survey,
      { ...payload([{ questionId: 'r1', value: 3 }]), name: 'Pat', client: 'abc' },
      ctx,
    )
    expect(Object.keys(r!).sort()).toEqual([
      'answers',
      'at',
      'channel',
      'deliveryId',
      'id',
      'otherText',
      'surveyId',
    ])
  })
})
