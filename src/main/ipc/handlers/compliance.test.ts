// Integration: compliance channels through the IPC dispatcher against a real project folder,
// with the bundled packs read from the repo (source mode).
import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))
process.env.TTX_RESOURCES = resolve('.')

const { dispatch } = await import('../registry')
const handlers = (await import('./compliance')).default
const { createProject, loadProject } = await import('../../project/store')
const { createScenario, saveScenario } = await import('../../scenario/store')
const { writeFacilitatorState } = await import('../../facilitator/state')
const { Scenario, ScenarioBrief } = await import('@shared/schemas')

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as { msel: { id: string }[]; brief: Record<string, unknown> }

async function setup(orgType = 'airport') {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const parent = mkdtempSync(join(tmpdir(), 'ttx-comp-'))
  const { path: projectPath } = await createProject({ parentDir: parent, name: 'NCIA', orgType })
  const created = await createScenario(projectPath, {
    title: 'Flight',
    brief: ScenarioBrief.parse({}),
  })
  const msel = FIXTURE.msel.map((r) =>
    r.id === 'I-03'
      ? { ...r, triggers: [{ regulationId: 'circia', triggerId: 'covered_incident' }] }
      : r,
  )
  const scenario = Scenario.parse({
    ...FIXTURE,
    id: created.id,
    projectId: created.projectId,
    brief: { ...FIXTURE.brief, startDate: '2026-03-12', startWallClock: '09:00' },
    msel,
  })
  await saveScenario(projectPath, scenario, { by: 'user' })
  return { projectPath, scenarioId: created.id }
}

const ok = <T>(r: unknown): T => {
  expect(r).toMatchObject({ ok: true })
  return (r as { data: T }).data
}

type List = {
  regulations: {
    regulation: { id: string; status: string }
    enabled: boolean
    suggested: boolean
    source: { layer: string }
  }[]
  frameworks: { framework: { id: string }; enabled: boolean }[]
}

describe('compliance handlers', () => {
  it('lists the bundled regulations with the airport defaults switched on', async () => {
    const { projectPath } = await setup()
    const list = ok<List>(await dispatch(handlers, 'compliance:list', { projectPath }))
    const by = (id: string) => list.regulations.find((r) => r.regulation.id === id)!
    expect(list.regulations).toHaveLength(9)
    expect(by('tsa_aviation_cyber')).toMatchObject({
      enabled: true,
      suggested: true,
      source: { layer: 'bundled' },
    })
    expect(by('circia')).toMatchObject({ enabled: true, regulation: { status: 'proposed' } })
    expect(by('sec_8k_105')).toMatchObject({ enabled: false, suggested: false })
    expect(list.frameworks.find((f) => f.framework.id === 'nist_csf_2')?.enabled).toBe(true)
  })

  it('switches regulations on and off in project.json', async () => {
    const { projectPath } = await setup()
    const saved = ok(
      await dispatch(handlers, 'compliance:set', {
        projectPath,
        regulations: { sec_8k_105: true, circia: false },
      }),
    )
    expect(saved).toEqual({
      regulations: { sec_8k_105: true, circia: false },
      frameworks: {},
      modelMapping: false,
    })
    expect((await loadProject(projectPath)).compliance?.regulations.sec_8k_105).toBe(true)
    const list = ok<List>(await dispatch(handlers, 'compliance:list', { projectPath }))
    expect(list.regulations.find((r) => r.regulation.id === 'circia')!.enabled).toBe(false)
  })

  it('keeps model-assisted mapping off until the project switches it on, and keeps it on', async () => {
    const { projectPath } = await setup()
    const first = ok<{ modelMapping: boolean }>(
      await dispatch(handlers, 'compliance:list', { projectPath }),
    )
    expect(first.modelMapping).toBe(false)
    await dispatch(handlers, 'compliance:set', { projectPath, modelMapping: true })
    await dispatch(handlers, 'compliance:set', { projectPath, regulations: { circia: true } })
    const list = ok<{ modelMapping: boolean }>(
      await dispatch(handlers, 'compliance:list', { projectPath }),
    )
    expect(list.modelMapping).toBe(true)
  })

  it('refuses an id that is not a regulation id', async () => {
    const { projectPath } = await setup()
    const r = await dispatch(handlers, 'compliance:set', {
      projectPath,
      regulations: { '../evil': true },
    })
    expect(r).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })

  it("prefers the project's own copy of a regulation over the bundled one", async () => {
    const { projectPath } = await setup()
    const own = JSON.parse(readFileSync(resolve('packs/regulations/circia.json'), 'utf8'))
    own.statusNote = 'Final rule published (project copy).'
    own.status = 'in_force'
    mkdirSync(join(projectPath, 'compliance', 'regulations'), { recursive: true })
    writeFileSync(
      join(projectPath, 'compliance', 'regulations', 'circia.json'),
      JSON.stringify(own),
    )
    const list = ok<List>(await dispatch(handlers, 'compliance:list', { projectPath }))
    expect(list.regulations.find((r) => r.regulation.id === 'circia')).toMatchObject({
      regulation: { status: 'in_force' },
      source: { layer: 'project' },
    })
  })

  it('builds the coverage report from the MSEL and the facilitator session', async () => {
    const { projectPath, scenarioId } = await setup()
    await writeFacilitatorState(projectPath, scenarioId, {
      elapsedMin: 120,
      delivered: { 'I-03': { at: '2026-10-28T14:00:00.000Z', exerciseTime: '0:20' } },
      notes: {},
      generalNotes: '',
      hotwash: [],
      decisions: [],
      compliance: {
        fired: [
          {
            id: 'f1',
            regulationId: 'circia',
            triggerId: 'covered_incident',
            exerciseMin: 20,
            scenarioAt: '2026-03-12T09:20',
            by: 'row',
            rowId: 'I-03',
            note: '',
          },
        ],
        clocks: {},
        onScreen: [],
      },
    })
    const report = ok<{
      frameworks: {
        id: string
        rows: { controlId: string; rowIds: string[]; evidence: string }[]
      }[]
      clocks: { clock: string; dueAt?: string; result: string }[]
    }>(await dispatch(handlers, 'compliance:coverage', { projectPath, scenarioId }))
    expect(report.frameworks.map((f) => f.id)).toEqual(['nist_csf_2'])
    const rsco = report.frameworks[0]!.rows.find((r) => r.controlId === 'RS.CO-02')!
    expect(rsco.rowIds).toContain('I-03')
    expect(rsco.evidence).toBe('delivered')
    expect(report.clocks.find((c) => c.clock === 'Covered cyber incident report')).toMatchObject({
      dueAt: '2026-03-15T09:20',
      result: 'running',
    })
  })
})
