// The survey store against a real project folder: definitions, append-only responses,
// duplicate-scenario behaviour and the exercise-record feed for the AAR (#419).
import { describe, expect, it, vi } from 'vitest'
import { promises as fs, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false, getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { createProject } = await import('../project/store')
const { createScenario } = await import('../scenario/store')
const { duplicateScenario } = await import('../scenario/manage')
const { scenarioLayout } = await import('../scenario/layout')
const { ScenarioBrief, Survey } = await import('@shared/schemas')
const store = await import('./store')
const { scenarioSurveySummaries, surveyEvidenceRef } = await import('./results')
const { surveysFromTemplate } = await import('./templates')

const NOW = '2026-10-28T14:00:00.000Z'

async function setup() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const parent = mkdtempSync(join(tmpdir(), 'ttx-surveys-'))
  const { path: root } = await createProject({ parentDir: parent, name: 'NCIA' })
  const s = await createScenario(root, { title: 'Flight', brief: ScenarioBrief.parse({}) })
  return { root, scenarioId: s.id }
}

const feedback = (id = 'FEEDBACK') =>
  Survey.parse({
    id,
    title: 'Feedback',
    kind: 'participant_feedback',
    createdAt: NOW,
    updatedAt: NOW,
    sections: [{ id: 's', questions: [{ id: 'q1', type: 'rating', text: 'Organized' }] }],
  })

const answer = (id: string, value: number, surveyId = 'FEEDBACK') => ({
  id,
  surveyId,
  channel: 'paper' as const,
  at: NOW,
  answers: { q1: value },
  otherText: {},
})

describe('survey store', () => {
  it('writes, lists and reads survey definitions', async () => {
    const { root, scenarioId } = await setup()
    await store.writeSurvey(root, scenarioId, feedback())
    const [listed] = await store.listSurveys(root, scenarioId)
    expect(listed!.title).toBe('Feedback')
    expect((await store.readSurvey(root, scenarioId, 'FEEDBACK')).id).toBe('FEEDBACK')
  })

  it('refuses a save based on an older copy', async () => {
    const { root, scenarioId } = await setup()
    const saved = await store.writeSurvey(root, scenarioId, feedback())
    await store.writeSurvey(root, scenarioId, { ...saved, title: 'Changed' })
    await expect(
      store.writeSurvey(
        root,
        scenarioId,
        { ...saved, title: 'Stale' },
        { baseUpdatedAt: '2000-01-01T00:00:00.000Z' },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('appends responses one per line and reads them back', async () => {
    const { root, scenarioId } = await setup()
    await store.writeSurvey(root, scenarioId, feedback())
    await store.appendResponse(root, scenarioId, answer('R1', 4))
    expect(await store.appendResponse(root, scenarioId, answer('R2', 2))).toBe(2)
    const raw = await fs.readFile(
      scenarioLayout(root, scenarioId).surveyResponses('FEEDBACK'),
      'utf8',
    )
    expect(raw.trim().split('\n')).toHaveLength(2)
    expect((await store.readResponses(root, scenarioId, 'FEEDBACK')).map((r) => r.id)).toEqual([
      'R1',
      'R2',
    ])
  })

  it('lets a re-sent response replace the first by id, never adding a second', async () => {
    const { root, scenarioId } = await setup()
    await store.writeSurvey(root, scenarioId, feedback())
    await store.appendResponse(root, scenarioId, answer('R1', 4))
    await store.appendResponse(root, scenarioId, answer('R1', 1))
    const responses = await store.readResponses(root, scenarioId, 'FEEDBACK')
    expect(responses).toHaveLength(1)
    expect(responses[0]!.answers.q1).toBe(1)
  })

  it('skips a line cut short by a crash and keeps appending after it', async () => {
    const { root, scenarioId } = await setup()
    await store.writeSurvey(root, scenarioId, feedback())
    const file = scenarioLayout(root, scenarioId).surveyResponses('FEEDBACK')
    await fs.writeFile(file, `${JSON.stringify(answer('R1', 4))}\n{"id":"R2","surv`)
    await store.appendResponse(root, scenarioId, answer('R3', 5))
    const ids = (await store.readResponses(root, scenarioId, 'FEEDBACK')).map((r) => r.id)
    expect(ids).toEqual(['R1', 'R3'])
  })

  it('refuses a response with an identity field', async () => {
    const { root, scenarioId } = await setup()
    await store.writeSurvey(root, scenarioId, feedback())
    await expect(
      store.appendResponse(root, scenarioId, { ...answer('R1', 3), name: 'Pat' } as never),
    ).rejects.toThrow()
  })

  it('deletes one response or all of them', async () => {
    const { root, scenarioId } = await setup()
    await store.writeSurvey(root, scenarioId, feedback())
    for (const id of ['R1', 'R2', 'R3']) await store.appendResponse(root, scenarioId, answer(id, 3))
    expect(await store.deleteResponses(root, scenarioId, 'FEEDBACK', 'R2')).toBe(2)
    expect(await store.deleteResponses(root, scenarioId, 'FEEDBACK')).toBe(0)
    expect(await store.readResponses(root, scenarioId, 'FEEDBACK')).toEqual([])
  })

  it('unlinks the other edition when one edition of a pair is deleted', async () => {
    const { root, scenarioId } = await setup()
    const [before, after] = surveysFromTemplate('confidence-before', { now: NOW, objectives: [] })
    await store.writeSurvey(root, scenarioId, before!)
    await store.writeSurvey(root, scenarioId, after!)
    await store.deleteSurvey(root, scenarioId, before!.id)
    expect((await store.readSurvey(root, scenarioId, after!.id)).pairId).toBeUndefined()
  })

  it('copies survey definitions, not responses, when the scenario is duplicated', async () => {
    const { root, scenarioId } = await setup()
    await store.writeSurvey(root, scenarioId, feedback())
    await store.appendResponse(root, scenarioId, answer('R1', 4))
    const copy = await duplicateScenario(root, scenarioId)
    expect((await store.listSurveys(root, copy.id)).map((s) => s.id)).toEqual(['FEEDBACK'])
    expect(await store.readResponses(root, copy.id, 'FEEDBACK')).toEqual([])
  })
})

describe('scenarioSurveySummaries (the AAR feed)', () => {
  it('summarizes surveys with responses and leaves out archived and empty ones', async () => {
    const { root, scenarioId } = await setup()
    await store.writeSurvey(root, scenarioId, feedback())
    await store.writeSurvey(root, scenarioId, { ...feedback('EMPTY'), title: 'Empty' })
    await store.writeSurvey(root, scenarioId, { ...feedback('OLD'), status: 'archived' })
    for (const [id, v] of [
      ['R1', 5],
      ['R2', 4],
      ['R3', 3],
    ] as const)
      await store.appendResponse(root, scenarioId, answer(id, v))
    await store.appendResponse(root, scenarioId, answer('R9', 1, 'OLD'))
    const summaries = await scenarioSurveySummaries(root, scenarioId, 3)
    expect(summaries.map((s) => s.surveyId)).toEqual(['FEEDBACK'])
    expect(summaries[0]!.questions[0]).toMatchObject({ mean: 4, n: 3 })
  })

  it('reports a before/after comparison once, on the after edition', async () => {
    const { root, scenarioId } = await setup()
    const objectives = [{ id: 'OBJ1', name: 'Manual', text: 'Manual boarding.' }]
    const [before, after] = surveysFromTemplate('confidence-before', { now: NOW, objectives })
    await store.writeSurvey(root, scenarioId, before!)
    await store.writeSurvey(root, scenarioId, after!)
    const qid = before!.sections[0]!.questions[0]!.id
    for (const [i, [b, a]] of (
      [
        [2, 4],
        [3, 5],
        [2, 4],
      ] as const
    ).entries()) {
      await store.appendResponse(root, scenarioId, {
        ...answer(`B${i}`, b, before!.id),
        answers: { [qid]: b },
      })
      await store.appendResponse(root, scenarioId, {
        ...answer(`A${i}`, a, after!.id),
        answers: { [qid]: a },
      })
    }
    const summaries = await scenarioSurveySummaries(root, scenarioId, 3)
    const b = summaries.find((s) => s.edition === 'before')!
    const a = summaries.find((s) => s.edition === 'after')!
    expect(b.pairs).toEqual([])
    expect(a.pairs[0]).toMatchObject({ pairKey: 'OBJ1', before: 2.33, after: 4.33, delta: 2 })
  })

  it('names survey evidence the way the AAR record expects', () => {
    expect(surveyEvidenceRef('FEEDBACK', 'q1')).toBe('survey:FEEDBACK:q1')
    expect(surveyEvidenceRef('FEEDBACK', 'q1')).toMatch(/^(survey):[A-Za-z0-9:_.-]+$/)
  })
})
