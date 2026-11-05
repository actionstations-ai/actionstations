// A case study for a whole class on the live survey pipeline (spec 0452 FR-11): the survey a
// device receives carries no key, answers score on the same practice scale, small rooms see
// no detail, and the answer and rationale show only when the instructor reveals them.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Survey, SurveyResponse, type CaseStudy } from '@shared/schemas'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => resolve('.'),
    getPath: () => tmpdir(),
    on: () => undefined,
  },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_RESOURCES = resolve('.')

const { draftFromTrajectory } = await import('./from-trajectory')
const cls = await import('./class-session')
const store = await import('./store')
const { toWireSurvey } = await import('../surveys/wire')
const { createProject } = await import('../project/store')
const { createScenario } = await import('../scenario/store')
const { appendResponse } = await import('../surveys/store')
const { ScenarioBrief } = await import('@shared/schemas')

const study: CaseStudy = draftFromTrajectory({
  id: 'sep',
  kind: 'sepsis',
  seed: 3,
  contentNotice: 'This case includes the death of a patient.',
})
const stage = (id: string) => study.stages.find((s) => s.id === id)!

describe('the survey of a stage', () => {
  it('is a valid survey with one question per prompt and the stage in words', () => {
    const s = cls.surveyForStage(study, stage('s2'))
    expect(() => Survey.parse(s)).not.toThrow()
    const questions = s.sections[0]!.questions
    expect(questions.map((q) => q.id)).toEqual(stage('s2').prompts.map((p) => p.id))
    expect(questions.map((q) => q.type)).toEqual(['choice', 'text'])
    expect(s.introMd).toContain('Simulated data')
    expect(s.introMd).toContain('anonymous')
    expect(s.introMd).toContain('not NCLEX')
    expect(cls.classSurveyId('sep', 's2')).toBe('cs-sep-s2')
  })

  it('carries no key, credit, rationale or scoring in anything a device receives', () => {
    for (const st of study.stages) {
      const s = cls.surveyForStage(study, st)
      const wire = JSON.stringify(toWireSurvey(Survey.parse(s) as never, 'AAAAAAAAAAAAAAAAAAAAAA'))
      const text = JSON.stringify(s) + wire
      expect(text).not.toMatch(/"credit"|"relevant"|"order"|correctOptionId/)
      for (const p of st.prompts) expect(text).not.toContain(p.rationale)
    }
  })

  it('asks a ranking as the single most likely explanation and shows the content notice first', () => {
    const q = cls
      .surveyForStage(study, stage('s3'))
      .sections[0]!.questions.find((x) => x.id === 'p4')!
    expect(q).toMatchObject({ type: 'choice', multiple: false })
    expect(q.text).toContain('single most likely')
    expect(cls.surveyForStage(study, stage('s1')).introMd).toContain('Content notice')
    expect(cls.surveyForStage(study, stage('s2')).introMd).not.toContain('Content notice')
  })
})

describe('scoring a device’s answer', () => {
  const p = (id: string) => stage('s3').prompts.find((x) => x.id === id)!
  it('scores cues, actions and outcomes as the player does', () => {
    const cues = stage('s2').prompts[0]!
    if (cues.type !== 'select_cues') throw new Error('expected cues')
    expect(cls.scoreClassAnswer(cues, cues.key.relevant)).toBe(1)
    expect(cls.scoreClassAnswer(cues, [])).toBe(0)
    expect(cls.scoreClassAnswer(cues, undefined)).toBeUndefined()
  })

  it('scores a ranking asked as one choice by its place in the key order', () => {
    const rank = p('p4')
    if (rank.type !== 'rank_hypotheses') throw new Error('expected a ranking')
    const [best, , , last] = rank.key.order
    expect(cls.scoreClassAnswer(rank, [best!])).toBe(1)
    expect(cls.scoreClassAnswer(rank, [last!])).toBe(0)
    expect(cls.scoreClassAnswer(rank, ['nope'])).toBeUndefined()
  })

  it('scores a written rationale by the key points', () => {
    const why = stage('s2').prompts[1]!
    expect(cls.scoreClassAnswer(why, 'the trend shows infection and a fast heart rate')).toBe(1)
    expect(cls.scoreClassAnswer(why, 'unsure')).toBe(0)
  })
})

describe('the room’s results', () => {
  const cues = stage('s2').prompts[0]!
  if (cues.type !== 'select_cues') throw new Error('expected cues')
  const response = (n: number, ids: string[]): SurveyResponse =>
    SurveyResponse.parse({
      id: `r${n}`,
      surveyId: 'cs-sep-s2',
      channel: 'live',
      at: '2026-11-04T10:00:00.000Z',
      answers: { [cues.id]: ids, p3: 'the trend suggests infection' },
      otherText: {},
    })
  const room = [
    response(1, cues.key.relevant),
    response(2, cues.key.relevant.slice(0, 2)),
    response(3, []),
  ]

  it('shows counts and a mean score once enough devices have answered', () => {
    const r = cls.summarizeStage(study, stage('s2'), room, { minResponses: 3, reveal: false })
    const first = r.prompts[0]!
    expect(r.responses).toBe(3)
    expect(first.suppressed).toBe(false)
    expect(first.answered).toBe(3)
    expect(first.meanScore).toBeCloseTo((1 + 0.5 + 0) / 3, 2)
    expect(first.options!.find((o) => o.id === cues.key.relevant[0])!.count).toBe(2)
    expect(first.reveal).toBeUndefined()
  })

  it('holds back detail from a small room', () => {
    const r = cls.summarizeStage(study, stage('s2'), room.slice(0, 2), {
      minResponses: 3,
      reveal: false,
    })
    expect(r.prompts[0]).toMatchObject({ suppressed: true, meanScore: null })
    expect(r.prompts[0]!.options!.every((o) => o.count === null)).toBe(true)
    expect(r.prompts[0]!.answered).toBe(2)
  })

  it('shows the best answer and the rationale only when revealed', () => {
    const hidden = JSON.stringify(
      cls.summarizeStage(study, stage('s2'), room, { minResponses: 3, reveal: false }),
    )
    const shown = cls.summarizeStage(study, stage('s2'), room, { minResponses: 3, reveal: true })
    expect(hidden).not.toContain(cues.rationale)
    expect(shown.prompts[0]!.reveal!.rationale).toBe(cues.rationale)
    expect(shown.prompts[0]!.reveal!.bestAnswer.length).toBeGreaterThan(5)
  })
})

describe('preparing a stage in a scenario', () => {
  async function setup() {
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    const parent = mkdtempSync(join(tmpdir(), 'ttx-class-'))
    const { path: root } = await createProject({
      parentDir: parent,
      name: 'School',
      orgType: 'nursing',
    })
    const scenario = await createScenario(root, {
      title: 'Class',
      brief: ScenarioBrief.parse({ userPrompt: 'A class runs a case.' }),
    })
    return { root, scenarioId: scenario.id }
  }

  it('refuses a draft, writes the survey for a reviewed case and reads the stored answers', async () => {
    const { root, scenarioId } = await setup()
    await store.saveCaseStudy(root, study)
    await expect(cls.prepareClassStage(root, scenarioId, 'sep', 's2')).rejects.toThrow(/draft/)
    await store.reviewCaseStudy(root, 'sep', { by: 'Reviewer', note: '' })
    const prepared = await cls.prepareClassStage(root, scenarioId, 'sep', 's2')
    expect(prepared.surveyId).toBe('cs-sep-s2')
    await cls.prepareClassStage(root, scenarioId, 'sep', 's2')
    await expect(cls.prepareClassStage(root, scenarioId, 'sep', 'nope')).rejects.toThrow(/No stage/)
    const cues = stage('s2').prompts[0]!
    if (cues.type !== 'select_cues') throw new Error('expected cues')
    for (const n of [1, 2, 3])
      await appendResponse(root, scenarioId, {
        id: `r${n}`,
        surveyId: 'cs-sep-s2',
        channel: 'live',
        at: '2026-11-04T10:00:00.000Z',
        answers: { [cues.id]: cues.key.relevant },
        otherText: {},
      })
    const results = await cls.classStageResults(root, scenarioId, 'sep', 's2', {
      minResponses: 3,
      reveal: false,
    })
    expect(results.responses).toBe(3)
    expect(results.prompts[0]!.meanScore).toBe(1)
    const profile = await cls.classStepProfile(root, scenarioId, 'sep', 3)
    expect(profile.find((x) => x.step === 'recognize_cues')).toMatchObject({
      answers: 3,
      percent: 100,
    })
    expect(profile.find((x) => x.step === 'take_action')).toMatchObject({
      answers: 0,
      percent: null,
    })
  })
})
