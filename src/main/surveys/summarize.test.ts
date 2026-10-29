import { describe, expect, it } from 'vitest'
import { Survey, SurveyResponse } from '@shared/schemas'
import { mean, median, seededShuffle, summarizeSurvey } from './summarize'

const NOW = '2026-10-28T14:00:00.000Z'

function survey(over: Record<string, unknown> = {}): Survey {
  return Survey.parse({
    id: 'SURVEYA',
    title: 'Feedback',
    kind: 'participant_feedback',
    createdAt: NOW,
    updatedAt: NOW,
    sections: [
      {
        id: 's1',
        questions: [
          { id: 'q-rate', type: 'rating', text: 'Well organized' },
          {
            id: 'q-pick',
            type: 'choice',
            text: 'Which plan applies?',
            options: [
              { id: 'a', text: 'TIRP 13.6' },
              { id: 'b', text: 'ASP 6.4' },
            ],
            correctOptionId: 'a',
            allowOther: true,
          },
          { id: 'q-text', type: 'text', text: 'What would you change?' },
        ],
      },
    ],
    ...over,
  })
}

let seq = 0
function response(answers: Record<string, unknown>, over: Record<string, unknown> = {}) {
  seq++
  return SurveyResponse.parse({
    id: `R${String(seq).padStart(4, '0')}`,
    surveyId: 'SURVEYA',
    channel: 'paper',
    at: NOW,
    answers,
    ...over,
  })
}

const three = () => [
  response({ 'q-rate': 5, 'q-pick': ['a'], 'q-text': 'More time' }),
  response({ 'q-rate': 4, 'q-pick': ['b'], 'q-text': 'Bigger room' }),
  response({ 'q-rate': 2, 'q-pick': ['a'] }, { channel: 'manual' }),
]

describe('mean and median', () => {
  it('rounds the mean to two decimals and takes the middle value', () => {
    expect(mean([5, 4, 2])).toBe(3.67)
    expect(median([5, 4, 2])).toBe(4)
    expect(median([1, 2, 4, 5])).toBe(3)
    expect(mean([])).toBeUndefined()
  })
})

describe('summarizeSurvey', () => {
  it('counts responses per channel', () => {
    const s = summarizeSurvey(survey(), three())
    expect(s.responses).toBe(3)
    expect(s.byChannel).toEqual({ paper: 2, manual: 1 })
    expect(s.suppressed).toBe(false)
  })

  it('gives the mean, median and 1..5 distribution of a rating question', () => {
    const q = summarizeSurvey(survey(), three()).questions.find((x) => x.questionId === 'q-rate')!
    expect(q).toMatchObject({ n: 3, mean: 3.67, median: 4, distribution: [0, 1, 0, 1, 1] })
  })

  it('counts choices and the share that picked the correct answer', () => {
    const q = summarizeSurvey(survey(), three()).questions.find((x) => x.questionId === 'q-pick')!
    expect(q.choices).toEqual([
      { optionId: 'a', text: 'TIRP 13.6', count: 2, correct: true },
      { optionId: 'b', text: 'ASP 6.4', count: 1, correct: false },
    ])
    expect(q.shareCorrect).toBe(0.67)
  })

  it('hides every per-question detail below the response threshold, keeping counts', () => {
    const s = summarizeSurvey(survey(), three().slice(0, 2), { minResponses: 3 })
    expect(s.suppressed).toBe(true)
    expect(s.responses).toBe(2)
    for (const q of s.questions) {
      expect(q.suppressed).toBe(true)
      expect(q.mean).toBeUndefined()
      expect(q.distribution).toBeUndefined()
      expect(q.choices).toBeUndefined()
      expect(q.texts).toBeUndefined()
    }
  })

  it('hides a question answered fewer times than the threshold even when the survey is shown', () => {
    const q = summarizeSurvey(survey(), three()).questions.find((x) => x.questionId === 'q-text')!
    expect(q).toMatchObject({ n: 2, suppressed: true })
    expect(q.texts).toBeUndefined()
  })

  it('lists free text in a stable order that does not follow entry order', () => {
    const rs = ['one', 'two', 'three', 'four', 'five', 'six'].map((t) => response({ 'q-text': t }))
    const a = summarizeSurvey(survey(), rs).questions.find((x) => x.questionId === 'q-text')!
    const b = summarizeSurvey(survey(), [...rs].reverse()).questions.find(
      (x) => x.questionId === 'q-text',
    )!
    expect(a.texts).toEqual(b.texts)
    expect([...a.texts!].sort()).toEqual(['five', 'four', 'one', 'six', 'three', 'two'])
    expect(a.texts).not.toEqual(['one', 'two', 'three', 'four', 'five', 'six'])
  })

  it('ignores responses that belong to another survey', () => {
    const s = summarizeSurvey(survey(), [...three(), response({}, { surveyId: 'OTHER' })])
    expect(s.responses).toBe(3)
  })

  it('reports role groups only when the survey asks and the threshold is met', () => {
    const rs = three().map((r, i) => ({ ...r, roleGroup: i ? 'Operations' : 'Security' }))
    expect(summarizeSurvey(survey({ askRoleGroup: true }), rs).byRoleGroup).toEqual({
      Operations: 2,
      Security: 1,
    })
    expect(summarizeSurvey(survey(), rs).byRoleGroup).toEqual({})
    expect(summarizeSurvey(survey({ askRoleGroup: true }), rs.slice(1)).byRoleGroup).toEqual({})
  })
})

describe('before and after pairs', () => {
  const confidence = (id: string, edition: 'before' | 'after') =>
    Survey.parse({
      id,
      title: `Confidence (${edition})`,
      kind: 'confidence',
      edition,
      pairId: edition === 'before' ? 'AFTER' : 'BEFORE',
      createdAt: NOW,
      updatedAt: NOW,
      sections: [
        {
          id: 's',
          questions: ['manual', 'pio'].map((k) => ({
            id: `obj-${k}`,
            type: 'confidence',
            text: k,
            statement: `I could handle ${k}`,
            pairKey: k,
            edition,
          })),
        },
      ],
    })
  const answers = (surveyId: string, values: [number, number][]) =>
    values.map(([manual, pio]) => response({ 'obj-manual': manual, 'obj-pio': pio }, { surveyId }))

  it('compares before and after means per pair key, in aggregate', () => {
    const before = {
      survey: confidence('BEFORE', 'before'),
      responses: answers('BEFORE', [
        [2, 3],
        [2, 2],
        [3, 4],
      ]),
    }
    const after = {
      survey: confidence('AFTER', 'after'),
      responses: answers('AFTER', [
        [4, 3],
        [5, 3],
        [4, 4],
      ]),
    }
    const s = summarizeSurvey(after.survey, after.responses, { pair: before })
    expect(s.pairs).toEqual([
      {
        pairKey: 'manual',
        statement: 'I could handle manual',
        before: 2.33,
        after: 4.33,
        delta: 2,
        nBefore: 3,
        nAfter: 3,
      },
      {
        pairKey: 'pio',
        statement: 'I could handle pio',
        before: 3,
        after: 3.33,
        delta: 0.33,
        nBefore: 3,
        nAfter: 3,
      },
    ])
  })

  it('leaves out a side that has fewer answers than the threshold', () => {
    const before = {
      survey: confidence('BEFORE', 'before'),
      responses: answers('BEFORE', [[2, 3]]),
    }
    const after = {
      survey: confidence('AFTER', 'after'),
      responses: answers('AFTER', [
        [4, 3],
        [5, 3],
        [4, 4],
      ]),
    }
    const pair = summarizeSurvey(after.survey, after.responses, { pair: before }).pairs[0]!
    expect(pair.before).toBeUndefined()
    expect(pair.delta).toBeUndefined()
    expect(pair).toMatchObject({ after: 4.33, nBefore: 1, nAfter: 3 })
  })
})

describe('knowledge check', () => {
  const check = (id: string, edition: 'before' | 'after') =>
    Survey.parse({
      id,
      title: 'Knowledge Check',
      kind: 'knowledge_check',
      edition,
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
              options: [
                { id: 'o1', text: 'Duty manager' },
                { id: 'o2', text: 'Gate agent' },
              ],
              correctOptionId: 'o1',
              citation: { documentId: 'tirp', documentTitle: 'TIRP', headingPath: 'TIRP › 13.7' },
            },
          ],
        },
      ],
    })
  const picks = (surveyId: string, ids: string[]) =>
    ids.map((o) => response({ k1: [o] }, { surveyId }))

  it('reports the share correct per item before and after with its citation', () => {
    const before = {
      survey: check('KB', 'before'),
      responses: picks('KB', ['o2', 'o2', 'o1', 'o2']),
    }
    const after = { survey: check('KA', 'after'), responses: picks('KA', ['o1', 'o1', 'o1', 'o2']) }
    const s = summarizeSurvey(after.survey, after.responses, { pair: before })
    expect(s.knowledge).toEqual([
      expect.objectContaining({
        questionId: 'k1',
        shareBefore: 0.25,
        shareAfter: 0.75,
        nBefore: 4,
        nAfter: 4,
      }),
    ])
    expect(s.knowledge[0]!.citation?.headingPath).toBe('TIRP › 13.7')
  })
})

describe('seededShuffle', () => {
  it('is stable for a seed and independent of input order', () => {
    expect(seededShuffle(['a', 'b', 'c', 'd'], 'x')).toEqual(
      seededShuffle(['d', 'c', 'b', 'a'], 'x'),
    )
  })
})
