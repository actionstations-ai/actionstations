import { describe, expect, it } from 'vitest'
import { Survey } from './schemas/survey'
import {
  cleanAnswers,
  coerceAnswer,
  missingRequired,
  questionPrompt,
  roundToMinute,
  surveyQuestions,
  wireKind,
} from './survey-layout'

const NOW = '2026-10-28T14:00:00.000Z'
const survey = Survey.parse({
  id: 'S1',
  title: 'Check',
  createdAt: NOW,
  updatedAt: NOW,
  sections: [
    { id: 'a', questions: [{ id: 'rate', type: 'rating', text: 'Organized', required: true }] },
    {
      id: 'b',
      questions: [
        {
          id: 'one',
          type: 'choice',
          text: 'Pick one',
          options: [
            { id: 'x', text: 'X' },
            { id: 'y', text: 'Y' },
          ],
          allowOther: true,
        },
        {
          id: 'many',
          type: 'choice',
          multiple: true,
          text: 'Pick any',
          options: [
            { id: 'x', text: 'X' },
            { id: 'y', text: 'Y' },
          ],
        },
        { id: 'free', type: 'text', text: 'Tell us', long: false, maxLength: 5 },
        {
          id: 'conf',
          type: 'confidence',
          text: 'Manual boarding',
          statement: 'I could lead manual boarding',
          pairKey: 'manual',
          edition: 'before',
        },
      ],
    },
  ],
})
const q = (id: string) => surveyQuestions(survey).find((p) => p.question.id === id)!.question

describe('surveyQuestions', () => {
  it('numbers questions across sections in form order', () => {
    expect(surveyQuestions(survey).map((p) => [p.number, p.question.id])).toEqual([
      [1, 'rate'],
      [2, 'one'],
      [3, 'many'],
      [4, 'free'],
      [5, 'conf'],
    ])
  })
})

describe('wireKind', () => {
  it('maps question types onto the live protocol kinds', () => {
    expect(['rate', 'one', 'many', 'free', 'conf'].map((id) => wireKind(q(id)))).toEqual([
      'scale',
      'single',
      'multi',
      'text',
      'scale',
    ])
  })
})

describe('coerceAnswer', () => {
  it('clamps and rounds scale answers and drops non-numbers', () => {
    expect(coerceAnswer(q('rate'), 9)).toBe(5)
    expect(coerceAnswer(q('rate'), 0)).toBe(1)
    expect(coerceAnswer(q('rate'), '3')).toBe(3)
    expect(coerceAnswer(q('rate'), 'high')).toBeUndefined()
  })

  it('keeps only the question own options, one for a single choice', () => {
    expect(coerceAnswer(q('one'), ['y', 'x'])).toEqual(['y'])
    expect(coerceAnswer(q('many'), ['y', 'zz', 'x', 'y'])).toEqual(['y', 'x'])
    expect(coerceAnswer(q('one'), ['zz'])).toBeUndefined()
  })

  it('trims text and cuts it to the limit', () => {
    expect(coerceAnswer(q('free'), '  abcdefgh ')).toBe('abcde')
    expect(coerceAnswer(q('free'), '   ')).toBeUndefined()
  })
})

describe('cleanAnswers and missingRequired', () => {
  it('drops unknown question ids and reports unanswered required questions', () => {
    const cleaned = cleanAnswers(survey, { nope: 3, one: 'x', free: 'ok' }, { one: ' radio ' })
    expect(cleaned).toEqual({ answers: { one: ['x'], free: 'ok' }, otherText: { one: 'radio' } })
    expect(missingRequired(survey, cleaned).map((x) => x.id)).toEqual(['rate'])
    expect(missingRequired(survey, cleanAnswers(survey, { rate: 4 }))).toEqual([])
  })

  it('keeps Other text only where the question allows it', () => {
    expect(cleanAnswers(survey, {}, { many: 'x', free: 'y' }).otherText).toEqual({})
  })
})

describe('questionPrompt and roundToMinute', () => {
  it('shows a confidence statement in place of its short label', () => {
    expect(questionPrompt(q('conf'))).toBe('I could lead manual boarding')
    expect(questionPrompt(q('rate'))).toBe('Organized')
  })

  it('keeps only the minute of a timestamp', () => {
    expect(roundToMinute('2026-10-28T14:37:52.120Z')).toBe('2026-10-28T14:37:00.000Z')
  })
})
