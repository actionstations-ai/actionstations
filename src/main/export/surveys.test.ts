import { describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { Survey, type SurveyResponse } from '@shared/schemas'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { fixtureModel } = await import('../../../tests/fixtures/export/model')
const { summarizeSurvey } = await import('../surveys/summarize')
const { surveysFromTemplate } = await import('../surveys/templates')
const { surveyFormName } = await import('./naming')
const { planTargets } = await import('./run')
const { scenarioJson } = await import('./manifest')
const {
  buildSurveyFormHtml,
  buildSurveyResultsHtml,
  isPlayerForm,
  printableSurveys,
  surveyFormView,
} = await import('./surveys')

const NOW = '2026-10-28T14:00:00.000Z'
const count = (html: string, needle: string) => html.split(needle).length - 1

const knowledge = Survey.parse({
  id: 'KCHECK',
  title: 'Knowledge Check',
  kind: 'knowledge_check',
  status: 'ready',
  createdAt: NOW,
  updatedAt: NOW,
  sections: [
    {
      id: 's',
      title: 'Questions',
      questions: [
        {
          id: 'k1',
          type: 'choice',
          text: 'Who declares manual boarding?',
          options: [
            { id: 'a', text: 'Duty manager' },
            { id: 'b', text: 'Gate agent' },
          ],
          correctOptionId: 'a',
          citation: {
            documentId: 'tirp',
            documentTitle: 'TIRP',
            headingPath: 'TIRP › 13.7 Manual boarding',
            page: 41,
          },
        },
        { id: 't1', type: 'text', text: 'Anything else?', long: false },
      ],
    },
  ],
})

const feedback = () =>
  surveysFromTemplate('hseep-participant-feedback', { now: NOW, objectives: [] })[0]!

const response = (id: string, answers: SurveyResponse['answers']): SurveyResponse => ({
  id,
  surveyId: 'KCHECK',
  channel: 'paper',
  at: NOW,
  answers,
  otherText: {},
})

describe('printable survey form', () => {
  it('prints every question with numbered 1..5 boxes, option boxes and writing lines', () => {
    const model = fixtureModel()
    const survey = feedback()
    const html = buildSurveyFormHtml(model, survey)
    expect(count(html, 'class="sq sq--rating"')).toBe(8)
    expect(count(html, 'class="sq sq--text"')).toBe(5)
    expect(html).toContain('Part I: Exercise assessment')
    expect(html).toContain('Strongly agree')
    expect(html).toContain('This form is anonymous. Do not write your name on it.')
    expect(html).toContain('Return this form to the facilitator.')
    expect(html).toContain('EXERCISE — FOR TRAINING USE')
    expect(html).not.toMatch(/<script/i)
  })

  it('never prints the correct answer or its citation on a participant form', () => {
    const html = buildSurveyFormHtml(fixtureModel(), knowledge)
    expect(html).toContain('Duty manager')
    expect(html).not.toContain('correct')
    expect(html).not.toContain('13.7')
  })

  it('asks for the team only when the survey asks for a role group', () => {
    const model = fixtureModel()
    const off = surveyFormView(model, { ...feedback(), roleGroups: ['Operations'] })
    expect(off.roleGroups).toEqual([])
    const on = surveyFormView(model, {
      ...feedback(),
      askRoleGroup: true,
      roleGroups: ['Operations'],
    })
    expect(on.roleGroups).toEqual(['Operations'])
  })

  it('escapes survey text written by the designer', () => {
    const survey = { ...feedback(), title: '</style><script>alert(1)</script>' }
    survey.sections[0]!.questions[0]!.text = '<img src=x onerror=alert(1)>'
    const html = buildSurveyFormHtml(fixtureModel(), survey)
    expect(html).not.toMatch(/<script|<img src=x/i)
  })
})

describe('survey results PDF', () => {
  it('shows means, choices, the answer key and the citation', () => {
    const responses = [
      response('R1', { k1: ['a'] }),
      response('R2', { k1: ['a'] }),
      response('R3', { k1: ['b'] }),
    ]
    const summary = summarizeSurvey(knowledge, responses, { minResponses: 3 })
    const html = buildSurveyResultsHtml(fixtureModel(), [{ survey: knowledge, summary }])
    expect(html).toContain('3 responses (3 paper)')
    expect(html).toContain('Answered correctly: 67%')
    expect(html).toContain('Answer key (facilitator only)')
    expect(html).toContain('TIRP › 13.7 Manual boarding (p. 41)')
  })

  it('says why detail is hidden below the threshold', () => {
    const summary = summarizeSurvey(knowledge, [response('R1', { k1: ['a'] })], {
      minResponses: 3,
    })
    const html = buildSurveyResultsHtml(fixtureModel(), [{ survey: knowledge, summary }])
    expect(html).toContain('Details hidden until 3 responses have been recorded.')
    expect(html).not.toContain('Answered correctly')
  })
})

describe('which surveys print, and where', () => {
  const item = (survey: Survey) => ({ survey, summary: summarizeSurvey(survey, []) })

  it('prints surveys marked ready unless specific ones are chosen; never archived ones', () => {
    const draft = { ...feedback(), id: 'DRAFT' }
    const archived = { ...knowledge, id: 'OLD', status: 'archived' as const }
    const all = [item(knowledge), item(draft), item(archived)]
    expect(printableSurveys(all).map((s) => s.survey.id)).toEqual(['KCHECK'])
    expect(printableSurveys(all, ['DRAFT', 'OLD']).map((s) => s.survey.id)).toEqual(['DRAFT'])
  })

  it('treats debriefs as staff forms, everything else as participant forms', () => {
    expect(isPlayerForm(knowledge)).toBe(true)
    expect(isPlayerForm({ ...knowledge, kind: 'evaluator_debrief' })).toBe(false)
    expect(isPlayerForm({ ...knowledge, kind: 'facilitator_debrief' })).toBe(false)
  })

  it('names each form after the scenario and survey, unique per survey id', () => {
    expect(surveyFormName('Flight to Nowhere', { id: '01JABCDEF123456', title: 'Feedback' })).toBe(
      'Flight-to-Nowhere-Survey-Feedback-123456.pdf',
    )
  })

  it('makes the ZIP include survey forms and results', () => {
    expect(planTargets(['zip'])).toEqual(
      expect.arrayContaining(['surveys_pdf', 'survey_results_pdf']),
    )
  })

  it('puts survey definitions, never responses, into scenario.json', () => {
    const responses = [response('R1', { k1: ['a'] })]
    const summary = summarizeSurvey(knowledge, responses)
    const doc = JSON.parse(
      scenarioJson(fixtureModel({ surveys: [{ survey: knowledge, summary }] })),
    )
    expect(doc.surveys.map((s: { id: string }) => s.id)).toEqual(['KCHECK'])
    expect(JSON.stringify(doc)).not.toContain('R1')
    expect(JSON.parse(scenarioJson(fixtureModel())).surveys).toBeUndefined()
  })
})
