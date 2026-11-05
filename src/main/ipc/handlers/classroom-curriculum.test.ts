// Integration: outcomes, mappings and rubrics through the IPC dispatcher (#720, #722).
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))

const { dispatch } = await import('../registry')
const curriculum = (await import('./classroom-curriculum')).default
const classroom = (await import('./classroom')).default
const { createProject } = await import('../../project/store')
const { createScenario, saveScenario } = await import('../../scenario/store')
const { Scenario, ScenarioBrief } = await import('@shared/schemas')
const { STARTER_RUBRICS } = await import('@shared/classroom/io')

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>

const call = (channel: string, req: object) =>
  dispatch({ ...classroom, ...curriculum } as never, channel as never, req)
type Course = {
  data: { course: { outcomes: { id: string; code: string }[]; rubrics: { id: string }[] } }
}

async function ready() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const parent = mkdtempSync(join(tmpdir(), 'ttx-cur-'))
  const { path: projectPath } = await createProject({ parentDir: parent, name: 'Course' })
  const created = await createScenario(projectPath, {
    title: 'Run',
    brief: ScenarioBrief.parse({}),
  })
  await saveScenario(
    projectPath,
    Scenario.parse({ ...FIXTURE, id: created.id, projectId: created.projectId }),
    { by: 'user' },
  )
  await call('classroom:set-enabled', { projectPath, enabled: true })
  return { projectPath, scenarioId: created.id }
}

describe('outcomes', () => {
  it('saves outcomes, refuses duplicate codes and round-trips the JSON file', async () => {
    const { projectPath } = await ready()
    const saved = (await call('classroom:set-outcomes', {
      projectPath,
      outcomes: [
        { code: 'LO1', text: 'Communicate incident information to partners', bloom: 'apply' },
        { code: 'LO2', text: 'Evaluate response decisions against the plan' },
      ],
    })) as Course
    expect(saved.data.course.outcomes).toHaveLength(2)
    const dup = await call('classroom:set-outcomes', {
      projectPath,
      outcomes: [
        { code: 'LO1', text: 'a' },
        { code: 'lo1', text: 'b' },
      ],
    })
    expect(dup).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    const out = (await call('classroom:export-outcomes', { projectPath })) as {
      data: { json: string }
    }
    const back = (await call('classroom:import-outcomes', {
      projectPath,
      json: out.data.json,
      mode: 'add',
    })) as Course
    expect(back.data.course.outcomes).toHaveLength(2)
    const bad = await call('classroom:import-outcomes', { projectPath, json: '{', mode: 'add' })
    expect(bad).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })

  it('maps objectives to outcomes only after the instructor confirms, and drops mappings of removed outcomes', async () => {
    const { projectPath, scenarioId } = await ready()
    const objective = (FIXTURE.objectives as { id: string; name: string; text: string }[])[0]!
    await call('classroom:set-outcomes', {
      projectPath,
      outcomes: [{ code: 'LO1', text: `${objective.name} ${objective.text}` }],
    })
    const sug = (await call('classroom:suggest-mappings', { projectPath, scenarioId })) as {
      data: { outcomeId: string; objectiveId: string }[]
    }
    expect(sug.data.some((s) => s.objectiveId === objective.id)).toBe(true)
    const { outcomeId } = sug.data[0]!
    const set = (await call('classroom:set-mappings', {
      projectPath,
      scenarioId,
      mappings: [{ outcomeId, kind: 'objective', ref: objective.id, confirmed: true }],
    })) as { data: { course: { mappings: unknown[] } } }
    expect(set.data.course.mappings).toHaveLength(1)
    const again = (await call('classroom:suggest-mappings', { projectPath, scenarioId })) as {
      data: { objectiveId: string }[]
    }
    expect(again.data.some((s) => s.objectiveId === objective.id)).toBe(false)
    const cleared = (await call('classroom:set-outcomes', {
      projectPath,
      outcomes: [],
    })) as { data: { course: { mappings: unknown[] } } }
    expect(cleared.data.course.mappings).toEqual([])
  })
})

describe('rubrics', () => {
  it('adds the starter rubrics once and keeps edits', async () => {
    const { projectPath } = await ready()
    await call('classroom:add-starter-rubrics', { projectPath })
    const twice = (await call('classroom:add-starter-rubrics', { projectPath })) as Course
    expect(twice.data.course.rubrics).toHaveLength(STARTER_RUBRICS.length)
  })

  it('exports and imports a rubric, giving a clashing id a new one', async () => {
    const { projectPath } = await ready()
    await call('classroom:add-starter-rubrics', { projectPath })
    const out = (await call('classroom:export-rubric', {
      projectPath,
      rubricId: 'starter-team',
    })) as { data: { json: string; fileName: string } }
    expect(out.data.fileName).toBe('starter-team.rubric.json')
    const back = (await call('classroom:import-rubrics', {
      projectPath,
      json: out.data.json,
    })) as Course
    expect(back.data.course.rubrics).toHaveLength(STARTER_RUBRICS.length + 1)
    expect(new Set(back.data.course.rubrics.map((r) => r.id)).size).toBe(STARTER_RUBRICS.length + 1)
  })

  it('refuses a rubric with fewer than three levels or an unknown outcome link', async () => {
    const { projectPath } = await ready()
    const level = (points: number) => ({ label: `L${points}`, descriptor: '', points })
    const rubric = (levels: unknown[], outcomeIds: string[] = []) => ({
      formatVersion: 1,
      id: 'mine',
      name: 'Mine',
      role: 'team',
      source: '',
      criteria: [
        { id: 'c1', name: 'C', description: '', weight: 1, levels, outcomeIds, taskIds: [] },
      ],
    })
    const few = await call('classroom:save-rubric', {
      projectPath,
      rubric: rubric([level(0), level(1)]),
    })
    expect(few).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    const unknown = await call('classroom:save-rubric', {
      projectPath,
      rubric: rubric([level(0), level(1), level(2)], ['nope']),
    })
    expect(unknown).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    const ok = (await call('classroom:save-rubric', {
      projectPath,
      rubric: rubric([level(0), level(1), level(2)]),
    })) as Course
    expect(ok.data.course.rubrics.map((r) => r.id)).toEqual(['mine'])
    const gone = (await call('classroom:delete-rubric', {
      projectPath,
      rubricId: 'mine',
    })) as Course
    expect(gone.data.course.rubrics).toEqual([])
  })
})
