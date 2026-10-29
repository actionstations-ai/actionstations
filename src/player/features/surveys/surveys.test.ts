import { describe, expect, it } from 'vitest'
import type { Opened } from '../../../shared/live/codec'
import {
  applyClose,
  applyOpen,
  mayAnswer,
  missingAnswers,
  orderedSurveys,
  scalePoints,
  wireAnswers,
  type PlayerSurvey,
} from './surveys'

const ID = 'AAAAAAAAAAAAAAAAAAAAAA'

const open = (over: Record<string, unknown> = {}) =>
  ({
    payload: {
      surveyId: ID,
      title: 'Participant feedback',
      questions: [
        { id: 'r1', kind: 'scale', text: 'Realistic', min: 1, max: 5, required: true },
        {
          id: 'c1',
          kind: 'multi',
          text: 'Which',
          required: false,
          options: [{ id: 'a', label: 'A' }],
        },
        { id: 't1', kind: 'text', text: 'Change?', required: false },
      ],
      anonymous: true,
      targets: ['all'],
      ...over,
    },
  }) as unknown as Opened<'survey.open'>

const survey = (over: Partial<PlayerSurvey> = {}): PlayerSurvey => ({
  ...applyOpen({}, open(), 10).surveys[ID]!,
  ...over,
})

describe('applyOpen and applyClose', () => {
  it('records a new survey and keeps this device’s answers when it is announced again', () => {
    const first = applyOpen({}, open(), 10)
    expect(first.isNew).toBe(true)
    const answered = { [ID]: { ...first.surveys[ID]!, mine: { r1: 4 }, sent: false } }
    const again = applyOpen(answered, open({ title: 'Renamed' }), 99)
    expect(again.isNew).toBe(false)
    expect(again.surveys[ID]).toMatchObject({ title: 'Renamed', mine: { r1: 4 }, openedAt: 10 })
  })

  it('closes a known survey and ignores an unknown one', () => {
    const { surveys } = applyOpen({}, open(), 10)
    const close = { payload: { surveyId: ID } } as unknown as Opened<'survey.close'>
    expect(applyClose(surveys, close)[ID]!.status).toBe('closed')
    const other = {
      payload: { surveyId: 'BBBBBBBBBBBBBBBBBBBBBB' },
    } as unknown as Opened<'survey.close'>
    expect(applyClose(surveys, other)).toBe(surveys)
  })
})

describe('answers', () => {
  it('names the required questions that have no answer', () => {
    expect(missingAnswers(survey(), {}).map((q) => q.id)).toEqual(['r1'])
    expect(missingAnswers(survey(), { r1: 3 })).toEqual([])
  })

  it('sends only answered questions of the survey, text trimmed', () => {
    const sent = wireAnswers(survey(), { r1: 4, c1: [], t1: '  more time  ', zz: 'not a question' })
    expect(sent).toEqual([
      { questionId: 'r1', value: 4 },
      { questionId: 't1', value: 'more time' },
    ])
  })

  it('lists the points of a scale from its range', () => {
    const q = { id: 'x', kind: 'scale', text: '', required: false, min: 1, max: 5 } as const
    expect(scalePoints(q)).toEqual([1, 2, 3, 4, 5])
  })
})

describe('who answers and in what order', () => {
  it('lets any seat answer a survey for all, and only matching seats otherwise', () => {
    const forOps = survey({ targets: ['role:ops'] })
    expect(mayAnswer(survey(), { clientId: 'c', kind: 'observer' })).toBe(true)
    expect(mayAnswer(forOps, { clientId: 'c', kind: 'player', roleId: 'ops' })).toBe(true)
    expect(mayAnswer(forOps, { clientId: 'c', kind: 'player', roleId: 'pio' })).toBe(false)
    expect(mayAnswer(forOps, undefined)).toBe(false)
  })

  it('shows open surveys before closed ones, newest first', () => {
    const list = orderedSurveys({
      a: survey({ surveyId: 'a', status: 'closed', openedAt: 30 }),
      b: survey({ surveyId: 'b', openedAt: 10 }),
      c: survey({ surveyId: 'c', openedAt: 20 }),
    })
    expect(list.map((s) => s.surveyId)).toEqual(['c', 'b', 'a'])
  })
})
