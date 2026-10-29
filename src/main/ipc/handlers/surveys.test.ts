// Integration: surveys channels through the IPC dispatcher against a real project folder.
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Survey } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false, getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { dispatch } = await import('../registry')
const handlers = (await import('./surveys')).default
const { createProject } = await import('../../project/store')
const { createScenario, getScenario, saveScenario } = await import('../../scenario/store')
const { resetSettingsCache, updateSettings } = await import('../../settings/store')
const { ScenarioBrief } = await import('@shared/schemas')

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

async function setup() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  const parent = mkdtempSync(join(tmpdir(), 'ttx-surveys-ipc-'))
  const { path: projectPath } = await createProject({ parentDir: parent, name: 'NCIA' })
  const s = await createScenario(projectPath, { title: 'Flight', brief: ScenarioBrief.parse({}) })
  const scenario = await getScenario(projectPath, s.id)
  await saveScenario(
    projectPath,
    {
      ...scenario,
      objectives: [{ id: 'OBJ1', name: 'Manual', text: 'Run manual boarding.' }],
      roles: [
        { id: 'ops', name: 'Duty Manager', team: 'Operations' },
        { id: 'pio', name: 'PIO', team: 'Communications' },
      ] as never,
    },
    { by: 'user' },
  )
  const call = async <T>(channel: string, req: Record<string, unknown> = {}) => {
    const r = (await dispatch(handlers, channel as never, {
      projectPath,
      scenarioId: s.id,
      ...req,
    })) as Result<T>
    return r
  }
  const ok = async <T>(channel: string, req: Record<string, unknown> = {}) => {
    const r = await call<T>(channel, req)
    if (!r.ok) throw new Error(`${channel}: ${r.error.code} ${r.error.message}`)
    return r.data
  }
  return { call, ok }
}

describe('surveys handlers', () => {
  it('creates the HSEEP form from its template and lists it with no responses', async () => {
    const { ok } = await setup()
    const { surveys } = await ok<{ surveys: Survey[] }>('surveys:from-template', {
      templateId: 'hseep-participant-feedback',
    })
    expect(surveys).toHaveLength(1)
    expect(surveys[0]!.roleGroups).toEqual(['Operations', 'Communications'])
    const list = await ok<{ survey: Survey; responseCount: number }[]>('surveys:list')
    expect(list.map((l) => [l.survey.title, l.responseCount])).toEqual([
      ['Participant Feedback Form', 0],
    ])
  })

  it('keeps the questions of a before/after pair the same when one edition is saved', async () => {
    const { ok } = await setup()
    const { surveys } = await ok<{ surveys: Survey[] }>('surveys:from-template', {
      templateId: 'confidence-before',
    })
    const [before, after] = surveys as [Survey, Survey]
    const added = {
      id: 'pio-brief',
      type: 'confidence',
      text: 'PIO',
      statement: 'I could brief the PIO',
      pairKey: 'pio-brief',
      edition: 'before',
    }
    const edited = {
      ...before,
      sections: [{ ...before.sections[0]!, questions: [...before.sections[0]!.questions, added] }],
    }
    await ok('surveys:save', { survey: edited, baseUpdatedAt: before.updatedAt })
    const mirrored = await ok<Survey>('surveys:get', { surveyId: after.id })
    const last = mirrored.sections[0]!.questions.at(-1)!
    expect(last).toMatchObject({ id: 'pio-brief', type: 'confidence', edition: 'after' })
    expect(mirrored.title).toBe(after.title)
  })

  it('refuses a stale save with CONFLICT', async () => {
    const { ok, call } = await setup()
    const { surveys } = await ok<{ surveys: Survey[] }>('surveys:from-template', {
      templateId: 'blank',
    })
    const s = surveys[0]!
    await ok('surveys:save', { survey: { ...s, title: 'A' }, baseUpdatedAt: s.updatedAt })
    const r = await call('surveys:save', {
      survey: { ...s, title: 'B' },
      baseUpdatedAt: '2000-01-01T00:00:00.000Z',
    })
    expect(r.ok ? 'ok' : r.error.code).toBe('CONFLICT')
  })

  it('enters paper responses, requires required answers and drops unknown questions', async () => {
    const { ok, call } = await setup()
    const { surveys } = await ok<{ surveys: Survey[] }>('surveys:from-template', {
      templateId: 'blank',
    })
    const s = surveys[0]!
    const survey = {
      ...s,
      sections: [
        {
          ...s.sections[0]!,
          questions: [{ id: 'q1', type: 'rating', text: 'Organized', required: true }],
        },
      ],
    }
    await ok('surveys:save', { survey, baseUpdatedAt: s.updatedAt })
    const missing = await call('surveys:add-response', {
      surveyId: s.id,
      response: { answers: { ghost: 'x' } },
    })
    expect(missing.ok ? 'ok' : missing.error.code).toBe('VALIDATION')
    const added = await ok<{ count: number }>('surveys:add-response', {
      surveyId: s.id,
      response: { answers: { q1: 4, ghost: 'x' } },
    })
    expect(added.count).toBe(1)
    const [stored] = await ok<{ answers: object; channel: string; at: string }[]>(
      'surveys:responses',
      { surveyId: s.id },
    )
    expect(stored).toMatchObject({ answers: { q1: 4 }, channel: 'paper' })
    expect(stored!.at).toMatch(/:00\.000Z$/)
  })

  it('applies the anonymity threshold from settings to the summary', async () => {
    const { ok } = await setup()
    const { surveys } = await ok<{ surveys: Survey[] }>('surveys:from-template', {
      templateId: 'hseep-participant-feedback',
    })
    const surveyId = surveys[0]!.id
    for (const v of [5, 4])
      await ok('surveys:add-response', { surveyId, response: { answers: { structure: v } } })
    const hidden = await ok<{ suppressed: boolean; responses: number }>('surveys:summary', {
      surveyId,
    })
    expect(hidden).toMatchObject({ suppressed: true, responses: 2 })
    await updateSettings((s) => {
      s.surveys.minResponses = 2
    })
    const shown = await ok<{ suppressed: boolean; questions: { mean?: number }[] }>(
      'surveys:summary',
      { surveyId },
    )
    expect(shown.suppressed).toBe(false)
    expect(shown.questions[0]!.mean).toBe(4.5)
  })

  it('duplicates a survey without its responses and deletes a survey', async () => {
    const { ok, call } = await setup()
    const { surveys } = await ok<{ surveys: Survey[] }>('surveys:from-template', {
      templateId: 'facilitator-debrief',
    })
    const surveyId = surveys[0]!.id
    await ok('surveys:add-response', { surveyId, response: { answers: { worked: 'Clear roles' } } })
    const copy = await ok<Survey>('surveys:duplicate', { surveyId })
    expect(copy.title).toBe('Facilitator Debrief (copy)')
    expect(await ok('surveys:responses', { surveyId: copy.id })).toEqual([])
    await ok('surveys:delete', { surveyId })
    const gone = await call('surveys:get', { surveyId })
    expect(gone.ok ? 'ok' : gone.error.code).toBe('NOT_FOUND')
  })

  it('rejects a path-like survey id', async () => {
    const { call } = await setup()
    const r = await call('surveys:get', { surveyId: '../scenario' })
    expect(r.ok).toBe(false)
  })
})
