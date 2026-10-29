import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))
const { SURVEY_TEMPLATE_IDS, loadSurveyTemplates, surveyTemplateInfo, surveysFromTemplate } =
  await import('./templates')

const NOW = '2026-10-28T14:00:00.000Z'
const objectives = [
  { id: 'OBJ1', name: 'Manual boarding', text: 'Switch to manual boarding announcements.' },
  { id: 'OBJ2', name: '', text: 'Brief the PIO within 15 minutes.' },
]

describe('survey templates', () => {
  it('loads every template the app ships, each with a version', () => {
    const templates = loadSurveyTemplates()
    expect([...templates.keys()].sort()).toEqual([...SURVEY_TEMPLATE_IDS].sort())
    for (const t of templates.values()) expect(t.templateVersion).toBeGreaterThan(0)
  })

  it('lists the after edition of the confidence pair only through its before edition', () => {
    const info = surveyTemplateInfo()
    expect(info.find((t) => t.id === 'confidence-after')?.listed).toBe(false)
    expect(info.find((t) => t.id === 'confidence-before')).toMatchObject({
      listed: true,
      pairTemplateId: 'confidence-after',
    })
  })

  it.each(SURVEY_TEMPLATE_IDS)('%s instantiates as a valid draft survey', (id) => {
    const [survey] = surveysFromTemplate(id, { now: NOW, objectives })
    expect(survey).toMatchObject({ status: 'draft', templateId: id, createdAt: NOW })
  })

  it('creates the HSEEP form as one survey with no role-group question by default', () => {
    const surveys = surveysFromTemplate('hseep-participant-feedback', { now: NOW, objectives })
    expect(surveys).toHaveLength(1)
    expect(surveys[0]).toMatchObject({ kind: 'participant_feedback', askRoleGroup: false })
  })

  it('creates both confidence editions, linked, with one statement per objective', () => {
    const [before, after] = surveysFromTemplate('confidence-before', { now: NOW, objectives })
    expect(before!.pairId).toBe(after!.id)
    expect(after!.pairId).toBe(before!.id)
    expect([before!.edition, after!.edition]).toEqual(['before', 'after'])
    const statements = before!.sections[0]!.questions
    expect(statements.map((q) => q.type === 'confidence' && q.pairKey)).toEqual(['OBJ1', 'OBJ2'])
    expect(statements[1]!.text).toBe('Objective 2')
    const afterKeys = after!.sections[0]!.questions.map((q) => q.type === 'confidence' && q.pairKey)
    expect(afterKeys).toEqual(['OBJ1', 'OBJ2'])
  })

  it('creates the knowledge check as before and after editions with the same question ids', () => {
    const [before, after] = surveysFromTemplate('knowledge-check', { now: NOW, objectives })
    expect(before!.title).toBe('Knowledge Check (before)')
    expect(after!.title).toBe('Knowledge Check (after)')
    expect(after).toMatchObject({ edition: 'after', timing: 'post', pairId: before!.id })
    expect(before!.sections.map((s) => s.id)).toEqual(after!.sections.map((s) => s.id))
  })

  it('refuses an unknown template', () => {
    expect(() => surveysFromTemplate('nope', { now: NOW, objectives })).toThrow(
      /No survey template/,
    )
  })
})
