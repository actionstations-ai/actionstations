import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Survey, SurveyResponse, SurveyResponseInput, SurveyTemplate } from './survey'

const NOW = '2026-10-28T14:00:00.000Z'
const TEMPLATES = resolve('surveys/templates')

const choice = (over: Record<string, unknown> = {}) => ({
  id: 'k1',
  type: 'choice',
  text: 'Who declares manual boarding?',
  options: [
    { id: 'a', text: 'Duty manager' },
    { id: 'b', text: 'Gate agent' },
  ],
  ...over,
})

const surveyWith = (question: Record<string, unknown>) =>
  Survey.safeParse({
    id: 'S1',
    title: 'Knowledge Check',
    kind: 'knowledge_check',
    createdAt: NOW,
    updatedAt: NOW,
    sections: [{ id: 's', questions: [question] }],
  })

describe('Survey schema', () => {
  it('fills defaults: draft, post-exercise, no role group', () => {
    const s = Survey.parse({ id: 'S1', title: 'T', createdAt: NOW, updatedAt: NOW })
    expect(s).toMatchObject({
      kind: 'custom',
      timing: 'post',
      status: 'draft',
      askRoleGroup: false,
      sections: [],
    })
  })

  it('needs the correct answer of a knowledge-check item to be one of its options', () => {
    expect(surveyWith(choice({ correctOptionId: 'a' })).success).toBe(true)
    expect(surveyWith(choice({ correctOptionId: 'zz' })).success).toBe(false)
  })

  it('needs at least two options for a choice question', () => {
    expect(surveyWith(choice({ options: [{ id: 'a', text: 'Only' }] })).success).toBe(false)
  })

  it('refuses a survey saved by a newer format', () => {
    expect(
      Survey.safeParse({ formatVersion: 9, id: 'S1', title: 'T', createdAt: NOW, updatedAt: NOW })
        .success,
    ).toBe(false)
  })
})

describe('SurveyResponse schema', () => {
  const base = { id: 'R1', surveyId: 'S1', channel: 'paper', at: NOW, answers: { q1: 4 } }

  it('accepts an anonymous response', () => {
    expect(SurveyResponse.parse(base)).toEqual({ ...base, otherText: {} })
  })

  it('has no place for anything that identifies a respondent', () => {
    for (const extra of [{ name: 'Pat' }, { device: 'iPhone' }, { userAgent: 'x' }, { ip: '1' }])
      expect(SurveyResponse.safeParse({ ...base, ...extra }).success).toBe(false)
    expect(SurveyResponseInput.safeParse({ answers: {}, name: 'Pat' }).success).toBe(false)
  })

  it('keeps scale answers within 1..5', () => {
    expect(SurveyResponse.safeParse({ ...base, answers: { q1: 6 } }).success).toBe(false)
  })
})

describe('shipped survey templates', () => {
  const files = readdirSync(TEMPLATES).filter((f) => f.endsWith('.json'))

  it('ships the six templates from the spec', () => {
    expect(files.map((f) => f.replace('.json', '')).sort()).toEqual([
      'confidence-after',
      'confidence-before',
      'evaluator-debrief',
      'facilitator-debrief',
      'hseep-participant-feedback',
      'knowledge-check',
    ])
  })

  it.each(files)('%s parses and its id matches the file name', (file) => {
    const t = SurveyTemplate.parse(JSON.parse(readFileSync(join(TEMPLATES, file), 'utf8')))
    expect(`${t.templateId}.json`).toBe(file)
  })

  it('puts the HSEEP form in three parts with eight agreement statements', () => {
    const t = SurveyTemplate.parse(
      JSON.parse(readFileSync(join(TEMPLATES, 'hseep-participant-feedback.json'), 'utf8')),
    )
    expect(t.survey.sections.map((s) => s.title)).toEqual([
      'Part I: Exercise assessment',
      'Part II: Participant feedback',
      'Part III: Issues and corrective actions',
    ])
    expect(t.survey.sections[0]!.questions.every((q) => q.type === 'rating')).toBe(true)
    expect(t.survey.sections[0]!.questions).toHaveLength(8)
  })
})
