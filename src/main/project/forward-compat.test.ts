// #208: a project written by a newer build keeps the fields this build does not know, and a
// scenario.json from a newer format is refused instead of being rewritten.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Inject, Project, Scenario, ScenarioBrief, SCENARIO_FORMAT_VERSION } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { createProject, loadProject, updateProject } = await import('./store')
const { createScenario, getScenario, saveScenario, saveInject, listInjects } =
  await import('../scenario/store')
const { resetSettingsCache } = await import('../settings/store')

const readJsonFile = (path: string) =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
const writeJsonFile = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value))

describe('forward compatibility of persisted files (#208)', () => {
  let root: string
  beforeEach(async () => {
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    resetSettingsCache()
    root = (await createProject({ parentDir: mkdtempSync(join(tmpdir(), 'ttx-p-')), name: 'Fwd' }))
      .path
  })

  it('keeps unknown project.json keys through an update', async () => {
    const file = join(root, 'project.json')
    writeJsonFile(file, { ...readJsonFile(file), futureField: { a: 1 } })
    await updateProject(root, (p) => {
      p.name = 'Renamed'
    })
    const saved = readJsonFile(file)
    expect(saved.name).toBe('Renamed')
    expect(saved.futureField).toEqual({ a: 1 })
    expect((await loadProject(root)).futureField).toEqual({ a: 1 })
  })

  it('keeps unknown scenario.json keys through a save and writes a format version', async () => {
    const s = await createScenario(root, { title: 'T', brief: ScenarioBrief.parse({}) })
    const file = join(root, 'scenarios', s.id, 'scenario.json')
    expect(readJsonFile(file).formatVersion).toBe(SCENARIO_FORMAT_VERSION)
    writeJsonFile(file, { ...readJsonFile(file), futureField: 'kept' })
    const loaded = await getScenario(root, s.id)
    await saveScenario(root, { ...loaded, title: 'Edited' }, { by: 'user' })
    expect(readJsonFile(file)).toMatchObject({ title: 'Edited', futureField: 'kept' })
  })

  it('loads a scenario.json without a format version as version 1', async () => {
    const s = await createScenario(root, { title: 'Old', brief: ScenarioBrief.parse({}) })
    const file = join(root, 'scenarios', s.id, 'scenario.json')
    const { formatVersion: _drop, ...old } = readJsonFile(file)
    writeJsonFile(file, old)
    expect((await getScenario(root, s.id)).formatVersion).toBe(1)
  })

  it('refuses a scenario.json from a newer format', async () => {
    const s = await createScenario(root, { title: 'New', brief: ScenarioBrief.parse({}) })
    const file = join(root, 'scenarios', s.id, 'scenario.json')
    writeJsonFile(file, { ...readJsonFile(file), formatVersion: SCENARIO_FORMAT_VERSION + 1 })
    const err = await getScenario(root, s.id).catch((e: unknown) => e)
    expect(err).toMatchObject({ code: 'VALIDATION' })
    expect(JSON.stringify(err)).toMatch(/newer version of Action Stations/)
  })

  it('keeps unknown inject keys through a save', async () => {
    const s = await createScenario(root, { title: 'T', brief: ScenarioBrief.parse({}) })
    const inject = Inject.parse({ id: 'inj-1', mselRowId: 'I-01', type: 'memo', title: 'x' })
    await saveInject(root, s.id, { ...inject, futureField: 7 }, { by: 'ai' })
    const [loaded] = await listInjects(root, s.id)
    expect(loaded!.futureField).toBe(7)
    await saveInject(root, s.id, { ...loaded!, title: 'y' }, { by: 'user' })
    expect((await listInjects(root, s.id))[0]).toMatchObject({ title: 'y', futureField: 7 })
  })

  it('still validates known fields on the loose roots', () => {
    expect(() => Project.parse({ id: 'p1', name: '' })).toThrow()
    expect(Scenario.safeParse({ id: 'bad id!' }).success).toBe(false)
  })
})
