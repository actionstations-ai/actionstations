import { describe, expect, it } from 'vitest'
import { Survey } from '@shared/schemas/survey'
import { addOption, moveItem, newQuestion, removeOption, removeQuestion } from './survey-edit'
import { invalidReason } from './use-survey-draft'

const NOW = '2026-10-28T14:00:00.000Z'
const survey = Survey.parse({
  id: 'S1',
  title: 'Check',
  kind: 'knowledge_check',
  edition: 'after',
  createdAt: NOW,
  updatedAt: NOW,
  sections: [{ id: 's', questions: [{ id: 'q1', type: 'text', text: 'Why?' }] }],
})

describe('survey builder edits', () => {
  it('creates each question type valid for the schema', () => {
    for (const type of ['rating', 'choice', 'text', 'confidence'] as const) {
      const q = newQuestion(type, survey)
      const next = { ...survey, sections: [{ ...survey.sections[0]!, questions: [q] }] }
      expect(Survey.safeParse(next).success, type).toBe(true)
    }
  })

  it('gives a new confidence question its own pair key and the survey edition', () => {
    const q = newQuestion('confidence', survey)
    expect(q.type === 'confidence' && [q.pairKey, q.edition]).toEqual([q.id, 'after'])
  })

  it('moves items up and down and ignores moves past either end', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(['a', 'b', 'c'], 2, -2)).toEqual(['c', 'a', 'b'])
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
  })

  it('clears the correct answer when its option is removed', () => {
    const q = newQuestion('choice', survey)
    if (q.type !== 'choice') throw new Error('choice expected')
    const three = addOption(q)
    const keyed = { ...three, correctOptionId: three.options[2]!.id }
    expect(removeOption(keyed, three.options[0]!.id).correctOptionId).toBe(three.options[2]!.id)
    expect(removeOption(keyed, three.options[2]!.id).correctOptionId).toBeUndefined()
  })

  it('removes a question from whichever section holds it', () => {
    expect(removeQuestion(survey, 'q1').sections[0]!.questions).toEqual([])
  })
})

describe('invalidReason', () => {
  it('names the question that needs text', () => {
    const broken = {
      ...survey,
      sections: [
        { ...survey.sections[0]!, questions: [{ ...survey.sections[0]!.questions[0]!, text: '' }] },
      ],
    } as Survey
    expect(invalidReason(broken)).toBe('Section 1, question 1 needs its question text.')
    expect(invalidReason(survey)).toBeUndefined()
    expect(invalidReason({ ...survey, title: '' })).toBe('The survey needs a title.')
  })
})
