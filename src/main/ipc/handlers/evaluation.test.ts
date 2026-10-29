// Integration: evaluation channels through the IPC dispatcher against a real project folder.
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))

const { dispatch } = await import('../registry')
const handlers = (await import('./evaluation')).default
const { createProject } = await import('../../project/store')
const { createScenario, saveScenario } = await import('../../scenario/store')
const { Scenario, ScenarioBrief } = await import('@shared/schemas')

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>

async function setup() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const parent = mkdtempSync(join(tmpdir(), 'ttx-evalh-'))
  const { path: projectPath } = await createProject({ parentDir: parent, name: 'NCIA' })
  const created = await createScenario(projectPath, {
    title: 'Flight',
    brief: ScenarioBrief.parse({}),
  })
  const scenario = Scenario.parse({ ...FIXTURE, id: created.id, projectId: created.projectId })
  await saveScenario(projectPath, scenario, { by: 'user' })
  return { projectPath, scenarioId: created.id, scenario }
}

const observation = {
  id: 'O-I-06-T-01',
  at: '2026-10-28T14:00:00.000Z',
  exerciseTime: '1:15',
  rowId: 'I-06',
  taskId: 'T-01',
  criterionId: 'T-01',
  rating: 'met',
  note: 'PA silenced within two minutes.',
  evaluator: 'Evaluator 2',
  source: 'facilitate',
}

describe('evaluation handlers', () => {
  it('records, lists and removes observations', async () => {
    const { projectPath, scenarioId } = await setup()
    const saved = await dispatch(handlers, 'evaluation:observe', {
      projectPath,
      scenarioId,
      observation,
    })
    expect(saved).toMatchObject({ ok: true, data: { observations: [observation] } })
    const read = await dispatch(handlers, 'evaluation:get', { projectPath, scenarioId })
    expect(read).toMatchObject({ ok: true, data: { observations: [observation] } })
    const removed = await dispatch(handlers, 'evaluation:remove', {
      projectPath,
      scenarioId,
      observationId: observation.id,
    })
    expect(removed).toMatchObject({ ok: true, data: { observations: [] } })
  })

  it('derives the per-row criteria from the stored evaluation guides', async () => {
    const { projectPath, scenarioId, scenario } = await setup()
    const r = await dispatch(handlers, 'evaluation:criteria', { projectPath, scenarioId })
    expect(r.ok).toBe(true)
    const criteria = (r as { data: { rowId: string; taskId?: string; id: string }[] }).data
    // The fixture's decision rows are covered by critical tasks.
    expect(criteria.filter((c) => c.rowId === 'I-06').every((c) => c.taskId)).toBe(true)
    expect(criteria.filter((c) => c.rowId === 'I-09').length).toBeGreaterThan(0)
    // A row no task names falls back to its expected action; control cards get nothing.
    const uncovered = scenario.msel.find(
      (row) =>
        !['STARTEX', 'TIME_JUMP', 'ENDEX'].includes(row.purposeTag) &&
        !scenario.evaluation.eegs.some((e) =>
          e.criticalTasks.some((t) => t.rowIds.includes(row.id)),
        ),
    )!
    expect(criteria.filter((c) => c.rowId === uncovered.id)).toEqual([
      { id: `${uncovered.id}:expected`, rowId: uncovered.id, text: uncovered.expectedAction },
    ])
    expect(criteria.some((c) => c.rowId === 'START' || c.rowId === 'END')).toBe(false)
  })

  it('refuses unopened projects, bad ratings and unsafe ids', async () => {
    const { projectPath, scenarioId } = await setup()
    const other = mkdtempSync(join(tmpdir(), 'ttx-x-'))
    expect(
      await dispatch(handlers, 'evaluation:get', { projectPath: other, scenarioId }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(
      await dispatch(handlers, 'evaluation:observe', {
        projectPath,
        scenarioId,
        observation: { ...observation, rating: 'excellent' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    expect(
      await dispatch(handlers, 'evaluation:observe', {
        projectPath,
        scenarioId,
        observation: { ...observation, id: '../escape' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    expect(
      await dispatch(handlers, 'evaluation:criteria', { projectPath, scenarioId: 'nope' }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })
})
