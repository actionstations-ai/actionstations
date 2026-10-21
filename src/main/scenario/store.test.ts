import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Scenario, ScenarioBrief, type Inject } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { createProject, loadProject } = await import('../project/store')
const { resetSettingsCache } = await import('../settings/store')
const { onEmit } = await import('../lib/events')
const store = await import('./store')
const manage = await import('./manage')
const { MAX_HISTORY } = await import('./history')

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
)

let root: string
beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-sc-'))
  root = (await createProject({ parentDir, name: 'NCIA' })).path
})

const brief = ScenarioBrief.parse({ userPrompt: 'AODB tampering' })
const create = (title = 'Flight to Nowhere') => store.createScenario(root, { title, brief })

describe('scenario store', () => {
  it('creates the folder layout and registers meta in project.json', async () => {
    const s = await create()
    expect(s).toMatchObject({ title: 'Flight to Nowhere', status: 'draft', brief })
    const dir = join(root, 'scenarios', s.id)
    for (const sub of ['scenario.json', 'injects', 'documents', 'media', 'history'])
      expect(existsSync(join(dir, sub))).toBe(true)
    const project = await loadProject(root)
    expect(project.scenarios).toEqual([
      { id: s.id, title: s.title, status: 'draft', updatedAt: s.updatedAt },
    ])
    expect(s.projectId).toBe(project.id)
  })

  it('round-trips the Scenario 3 fixture through save/get with validation', async () => {
    const s = await create()
    const saved = await store.saveScenario(
      root,
      { ...Scenario.parse(FIXTURE), id: s.id, projectId: s.projectId },
      { by: 'user' },
    )
    const got = await store.getScenario(root, s.id)
    expect(got).toEqual(saved)
    expect(got.msel).toHaveLength(24)
    expect(got.phases.map((p) => p.title)).toEqual([
      'The Glitch',
      'The Crisis',
      'Manual Mode',
      'Recovery & Verification',
    ])
    const meta = (await loadProject(root)).scenarios[0]
    expect(meta).toMatchObject({ title: 'Flight to Nowhere', status: 'ready' })
  })

  it('rejects invalid scenarios and unknown ids', async () => {
    const s = await create()
    const bad = { ...s, msel: [{ id: 'I-01' }] } as unknown as Scenario
    await expect(store.saveScenario(root, bad, { by: 'user' })).rejects.toMatchObject({
      code: 'VALIDATION',
    })
    await expect(store.getScenario(root, 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      store.saveScenario(root, { ...s, id: 'ghost' }, { by: 'ai' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses ids that would escape the scenarios folder', async () => {
    for (const id of ['..', '../x', 'a/b', '.hidden', ''])
      await expect(store.getScenario(root, id)).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(manage.deleteScenario(root, '..')).rejects.toMatchObject({ code: 'VALIDATION' })
    expect(existsSync(join(root, 'project.json'))).toBe(true)
  })

  it('serializes concurrent updates so none are lost', async () => {
    const s = await create()
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.updateScenario(
          root,
          s.id,
          (d) => {
            d.brief.constraints.push(`c${i}`)
          },
          { by: 'ai', snapshot: false },
        ),
      ),
    )
    const got = await store.getScenario(root, s.id)
    expect(got.brief.constraints).toHaveLength(20)
  })

  it('keeps the last 50 history snapshots and skips them when snapshot:false', async () => {
    const s = await create()
    for (let i = 0; i < MAX_HISTORY + 5; i++)
      await store.updateScenario(root, s.id, (d) => void (d.title = `T${i}`), {
        by: 'ai',
        note: `n${i}`,
      })
    await store.updateScenario(root, s.id, (d) => void (d.title = 'quiet'), {
      by: 'ai',
      snapshot: false,
    })
    const entries = await manage.listHistory(root, s.id, 'scenario')
    expect(entries).toHaveLength(MAX_HISTORY)
    expect(entries[0]?.note).toBe(`n${MAX_HISTORY + 4}`)
    expect(entries.at(-1)?.note).toBe('n5')
  })

  it('restores a scenario snapshot as a new user save', async () => {
    const s = await create()
    await store.updateScenario(root, s.id, (d) => void (d.title = 'First'), { by: 'ai' })
    await store.updateScenario(root, s.id, (d) => void (d.title = 'Second'), { by: 'user' })
    const first = (await manage.listHistory(root, s.id, 'scenario')).find((e) => e.by === 'ai')!
    await manage.restoreHistory(root, s.id, 'scenario', first.id)
    expect((await store.getScenario(root, s.id)).title).toBe('First')
    const [latest] = await manage.listHistory(root, s.id, 'scenario')
    expect(latest).toMatchObject({ by: 'user', note: expect.stringMatching(/^Restored/) })
    expect((await loadProject(root)).scenarios[0]?.title).toBe('First')
  })

  it('writes documents with a project-relative path and per-doc history', async () => {
    const s = await create()
    expect(await store.readScenarioDoc(root, s.id, 'handbook')).toBe('')
    await store.writeScenarioDoc(root, s.id, 'handbook', '# v1', { by: 'ai' })
    await store.writeScenarioDoc(root, s.id, 'handbook', '# v2', { by: 'user' })
    expect(await store.readScenarioDoc(root, s.id, 'handbook')).toBe('# v2')
    const got = await store.getScenario(root, s.id)
    expect(got.documents.handbook).toBe(`scenarios/${s.id}/documents/handbook.md`)
    const hist = await manage.listHistory(root, s.id, 'handbook')
    expect(hist.map((h) => h.by)).toEqual(['user', 'ai'])
    await manage.restoreHistory(root, s.id, 'handbook', hist[1]!.id)
    expect(await store.readScenarioDoc(root, s.id, 'handbook')).toBe('# v1')
    expect(await manage.listHistory(root, s.id, 'scenario')).toHaveLength(0)
  })

  it('saves injects with versions and lists them in MSEL order', async () => {
    const s = await create()
    await store.saveScenario(root, { ...Scenario.parse(FIXTURE), id: s.id }, { by: 'ai' })
    const inject = (id: string, row: string): Inject =>
      ({
        id,
        mselRowId: row,
        type: 'tweet',
        title: id,
        deliveryMode: 'hand_to_role',
        fields: { text: 'NCIA is a joke!' },
        citations: [],
        assets: [],
        versions: [],
        includeInDeck: true,
        locked: false,
      }) as Inject
    await store.saveInject(root, s.id, inject('inj-b', 'I-06b'), { by: 'ai' })
    const a = await store.saveInject(root, s.id, inject('inj-a', 'I-04'), { by: 'ai' })
    const a2 = await store.saveInject(root, s.id, { ...a, title: 'edited' }, { by: 'user' })
    expect(a2.versions.map((v) => v.by)).toEqual(['ai', 'user'])
    const list = await store.listInjects(root, s.id)
    expect(list.map((i) => i.id)).toEqual(['inj-a', 'inj-b'])
    await expect(
      store.saveInject(root, s.id, { ...a, type: 'not-a-type' }, { by: 'user' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('emits project:changed with the scenario id on save', async () => {
    const s = await create()
    const seen: unknown[] = []
    const off = onEmit((name, payload) => name === 'project:changed' && seen.push(payload))
    await store.saveScenario(root, s, { by: 'user' })
    off()
    expect(seen).toContainEqual({ path: root, what: 'scenario', scenarioId: s.id })
  })
})

describe('scenario folder operations', () => {
  it('lists meta newest first', async () => {
    const a = await create('A')
    const b = await create('B')
    await store.updateScenario(root, a.id, (d) => void (d.subtitle = 'x'), { by: 'user' })
    expect((await manage.listScenarios(root)).map((m) => m.id)).toEqual([a.id, b.id])
  })

  it('deletes the folder and the project.json entry', async () => {
    const s = await create()
    await manage.deleteScenario(root, s.id)
    expect(existsSync(join(root, 'scenarios', s.id))).toBe(false)
    expect((await loadProject(root)).scenarios).toEqual([])
    expect(existsSync(join(root, 'scenarios'))).toBe(true)
  })

  it('duplicates with a new id, "(copy)" title and retargeted paths', async () => {
    const s = await create()
    await store.writeScenarioDoc(root, s.id, 'briefing', '# Player briefing', { by: 'ai' })
    const mediaRel = `scenarios/${s.id}/media/inj-a/asset.png`
    await store.saveInject(
      root,
      s.id,
      {
        id: 'inj-a',
        mselRowId: 'I-04',
        type: 'tweet',
        title: 'Tweet',
        deliveryMode: 'hand_to_role',
        fields: {},
        citations: [],
        assets: [
          {
            id: 'asset',
            kind: 'image',
            path: mediaRel,
            provenance: { provider: 'template', createdAt: s.createdAt },
          },
        ],
        versions: [],
        includeInDeck: true,
        locked: false,
      } as unknown as Inject,
      { by: 'ai' },
    )
    const copy = await manage.duplicateScenario(root, s.id)
    expect(copy.id).not.toBe(s.id)
    expect(copy.title).toBe('Flight to Nowhere (copy)')
    expect(copy.documents.briefing).toBe(`scenarios/${copy.id}/documents/briefing.md`)
    expect(await store.readScenarioDoc(root, copy.id, 'briefing')).toBe('# Player briefing')
    const [inj] = await store.listInjects(root, copy.id)
    expect(inj?.assets[0]?.path).toBe(`scenarios/${copy.id}/media/inj-a/asset.png`)
    expect(await manage.listHistory(root, copy.id, 'briefing')).toEqual([])
    expect((await loadProject(root)).scenarios.map((m) => m.id).sort()).toEqual(
      [s.id, copy.id].sort(),
    )
  })
})
