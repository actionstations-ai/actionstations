// Survey translation (#501): which words move, what stays, the review states, the job with the
// mock provider, and the Spanish printable form.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Scenario, ScenarioBrief, Survey } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_RESOURCES = resolve('.')

const { createProject } = await import('../project/store')
const { resetSettingsCache } = await import('../settings/store')
const scenarios = await import('../scenario/store')
const surveyStore = await import('../surveys/store')
const { MockTextProvider } = await import('../providers/mock/adapter')
const { loadPrompt, renderPrompt } = await import('../prompts')
const { runTranslation } = await import('./job')
const store = await import('./store')
const { assertReviewed } = await import('./overlay')
const { applySurveyTexts, surveyLabels, surveyTexts, translatedSurvey } = await import('./survey')
const { fixtureModel } = await import('../../../tests/fixtures/export/model')
const { buildSurveyFormHtml } = await import('../export/surveys')

const NOW = '2026-10-28T14:00:00.000Z'
const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
)
const config = { id: 'mock', kind: 'mock' as const, label: 'Mock', options: {}, enabled: true }
const ctx = {
  jobId: 'job',
  signal: new AbortController().signal,
  progress: () => undefined,
  log: () => undefined,
  throwIfCancelled: () => undefined,
}
const deps = () => ({
  resolveTextProvider: async () => ({
    provider: new MockTextProvider(config) as never,
    model: 'mock-large',
    providerId: 'mock',
  }),
  loadPrompt,
  renderPrompt,
})

const survey = Survey.parse({
  id: 'FEEDBACK',
  title: 'Participant Feedback',
  kind: 'participant_feedback',
  status: 'ready',
  introMd: 'Tell us how it went.',
  createdAt: NOW,
  updatedAt: NOW,
  sections: [
    {
      id: 'sec1',
      title: 'Your view',
      questions: [
        {
          id: 'r1',
          type: 'rating',
          text: 'The exercise was realistic.',
          lowLabel: 'Disagree',
          highLabel: 'Agree',
        },
        {
          id: 'c1',
          type: 'choice',
          text: 'Who declares manual boarding?',
          options: [
            { id: 'a', text: 'Duty manager' },
            { id: 'b', text: 'Gate agent' },
          ],
          correctOptionId: 'a',
        },
        { id: 't1', type: 'text', text: 'Anything else?' },
      ],
    },
  ],
})

describe('which words of a survey are translated', () => {
  it('lists titles, questions, help, scale ends and answer choices by position', () => {
    expect(surveyTexts(survey)).toMatchObject({
      title: 'Participant Feedback',
      intro: 'Tell us how it went.',
      's:sec1:title': 'Your view',
      'q:r1:text': 'The exercise was realistic.',
      'q:r1:low': 'Disagree',
      'o:c1:a': 'Duty manager',
      'q:t1:text': 'Anything else?',
    })
  })

  it('puts translated words back and keeps ids, the correct answer and untouched words', () => {
    const out = applySurveyTexts(survey, { title: 'Comentarios', 'o:c1:a': 'Gerente de turno' })
    const choice = out.sections[0]!.questions[1]!
    expect(out.title).toBe('Comentarios')
    expect(out.id).toBe('FEEDBACK')
    expect(choice).toMatchObject({ id: 'c1', correctOptionId: 'a' })
    expect(choice.type === 'choice' && choice.options.map((o) => [o.id, o.text])).toEqual([
      ['a', 'Gerente de turno'],
      ['b', 'Gate agent'],
    ])
  })

  it('names each key for the review screen', () => {
    const labels = surveyLabels(survey)
    expect(labels['q:r1:low']).toBe('Question 1: low end of the scale')
    expect(labels['o:c1:b']).toBe('Question 2: answer 2')
    expect(labels['s:sec1:title']).toBe('Section 1: title')
  })
})

let root: string
let scenarioId: string

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  root = (
    await createProject({ parentDir: mkdtempSync(join(tmpdir(), 'ttx-trs-')), name: 'Riverbend' })
  ).path
  const s = await scenarios.createScenario(root, {
    title: 'Water',
    brief: ScenarioBrief.parse({ userPrompt: 'x' }),
  })
  scenarioId = s.id
  const parsed = Scenario.parse({ ...FIXTURE, id: s.id, projectId: s.projectId })
  await scenarios.saveScenario(
    root,
    { ...parsed, languages: { player: ['es'], controller: false } },
    { by: 'user' },
  )
  await surveyStore.writeSurvey(root, scenarioId, survey)
  await surveyStore.writeSurvey(root, scenarioId, {
    ...survey,
    id: 'DEBRIEF',
    kind: 'facilitator_debrief',
  })
})

describe('survey translation job', () => {
  it('covers participant surveys only, not staff debriefs or archived ones', async () => {
    await surveyStore.writeSurvey(root, scenarioId, { ...survey, id: 'OLD', status: 'archived' })
    const items = await store.translationItems(root, scenarioId, 'es')
    expect(items.filter((i) => i.kind === 'survey').map((i) => i.id)).toEqual(['FEEDBACK'])
  })

  it('translates, marks machine, then reviewed on accept, and goes stale when the English changes', async () => {
    await runTranslation(ctx, { root, scenarioId, lang: 'es' }, deps())
    const saved = await surveyStore.readSurvey(root, scenarioId, 'FEEDBACK')
    expect(saved.translations?.es?.text['q:r1:text']).toBe('[es] The exercise was realistic.')
    expect(translatedSurvey(saved, 'es').title).toBe('[es] Participant Feedback')
    const status = async () =>
      (await store.translationItems(root, scenarioId, 'es')).find((i) => i.kind === 'survey')!
        .status
    expect(await status()).toBe('machine')

    await store.acceptItems(root, scenarioId, 'es')
    expect(await status()).toBe('reviewed')

    await surveyStore.writeSurvey(root, scenarioId, { ...saved, title: 'Feedback v2' })
    expect(await status()).toBe('stale')
  })

  it('does not block a Spanish export for a survey nobody translated, but does for an unreviewed one', async () => {
    const options = { controller: false, allowUnreviewed: false }
    await store.acceptItems(root, scenarioId, 'es')
    expect(await assertReviewed(root, scenarioId, 'es', options)).toBe(false)
    await runTranslation(ctx, { root, scenarioId, lang: 'es' }, deps())
    await expect(assertReviewed(root, scenarioId, 'es', options)).rejects.toThrow(/not reviewed/)
  })
})

describe('Spanish survey form', () => {
  it('prints the translated words with Spanish chrome and lang="es"', async () => {
    await runTranslation(ctx, { root, scenarioId, lang: 'es' }, deps())
    const saved = await surveyStore.readSurvey(root, scenarioId, 'FEEDBACK')
    const html = buildSurveyFormHtml(
      { ...fixtureModel(), lang: 'es' as const },
      translatedSurvey(saved, 'es'),
    )
    expect(html).toContain('<html lang="es">')
    expect(html).toContain('Este formulario es anónimo')
    expect(html).toContain('[es] The exercise was realistic.')
    expect(html).toContain('Marque una.')
    expect(html).toContain('Comentarios de los participantes')
    expect(html).not.toContain('Correct')
  })
})
