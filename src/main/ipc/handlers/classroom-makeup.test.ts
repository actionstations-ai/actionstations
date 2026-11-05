// Make-up versions through the IPC dispatcher (#730): the new scenario keeps the objectives, the
// confirmed outcome mapping and the session's rubrics; generation itself is stubbed here.
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))
const started: string[] = []
vi.mock('../../generate/scenario-jobs', () => ({
  continueJob: (_root: string, id: string) => {
    started.push(id)
    return { id: 'job1' }
  },
}))

const { dispatch } = await import('../registry')
const handlers = {
  ...(await import('./classroom')).default,
  ...(await import('./classroom-curriculum')).default,
  ...(await import('./classroom-scoring')).default,
}
const { createProject } = await import('../../project/store')
const { createScenario, saveScenario, getScenario } = await import('../../scenario/store')
const { Scenario, ScenarioBrief } = await import('@shared/schemas')

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>

const call = (channel: string, req: object) => dispatch(handlers as never, channel as never, req)
const data = <T>(r: unknown): T => {
  const x = r as { ok: boolean; data: T; error?: unknown }
  if (!x.ok) throw new Error(JSON.stringify(x.error))
  return x.data
}

describe('classroom:create-makeup', () => {
  it('creates a scenario with the same objectives, mapping and rubrics and starts generation', async () => {
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    const { path: projectPath } = await createProject({
      parentDir: mkdtempSync(join(tmpdir(), 'ttx-mk-')),
      name: 'Course',
    })
    const created = await createScenario(projectPath, {
      title: 'Run',
      brief: ScenarioBrief.parse({}),
    })
    const source = Scenario.parse({ ...FIXTURE, id: created.id, projectId: created.projectId })
    await saveScenario(projectPath, source, { by: 'user' })
    await call('classroom:set-enabled', { projectPath, enabled: true })
    await call('classroom:set-course', {
      projectPath,
      name: 'EM',
      term: '',
      sections: [{ name: 'A' }],
    })
    const state = data<{ course: { sections: { id: string }[] } }>(
      await call('classroom:get', { projectPath }),
    )
    const sectionId = state.course.sections[0]!.id
    await call('classroom:add-starter-rubrics', { projectPath })
    await call('classroom:set-outcomes', {
      projectPath,
      outcomes: [{ code: 'LO1', text: 'Communicate' }],
    })
    const outcomeId = data<{ course: { outcomes: { id: string }[] } }>(
      await call('classroom:get', { projectPath }),
    ).course.outcomes[0]!.id
    const objective = source.objectives[0]!
    await call('classroom:set-mappings', {
      projectPath,
      scenarioId: created.id,
      mappings: [{ outcomeId, kind: 'objective', ref: objective.id, confirmed: true }],
    })
    await call('classroom:set-session', {
      projectPath,
      session: {
        scenarioId: created.id,
        sectionId,
        practice: true,
        seats: {},
        rubricIds: ['starter-team'],
      },
    })

    const made = data<{ scenarioId: string; jobId: string }>(
      await call('classroom:create-makeup', { projectPath, scenarioId: created.id }),
    )
    expect(started).toEqual([made.scenarioId])
    const makeup = await getScenario(projectPath, made.scenarioId)
    expect(makeup.title).toBe(`${source.title} (make-up)`)
    expect(makeup.brief.makeupOf).toBe(created.id)
    expect(makeup.brief.fixedObjectives).toEqual(
      source.objectives.map((o) => ({
        id: o.id,
        name: o.name,
        text: o.text,
        ...(o.metricRef ? { metricRef: o.metricRef } : {}),
      })),
    )
    const course = data<{
      course: {
        mappings: { scenarioId: string; ref: string }[]
        sessions: {
          scenarioId: string
          practice: boolean
          rubricIds: string[]
          makeupOf?: string
        }[]
      }
    }>(await call('classroom:get', { projectPath })).course
    expect(course.mappings.filter((m) => m.scenarioId === made.scenarioId)).toHaveLength(1)
    expect(course.sessions.find((s) => s.scenarioId === made.scenarioId)).toMatchObject({
      practice: false,
      rubricIds: ['starter-team'],
      makeupOf: created.id,
    })
  })
})
