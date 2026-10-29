// translate:* through the IPC dispatcher with the mock provider routed to every task: the
// Languages panel's whole path (switch Spanish on, translate, review, accept) and the
// routing fallback from `translate` to the draft route.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Scenario, ScenarioBrief, type Inject } from '@shared/schemas'

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    getVersion: () => '0.0.1',
    getPath: () => tmpdir(),
    getAppPath: () => process.cwd(),
    isPackaged: false,
  },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_MOCK_PROVIDERS = '1'
process.env.TTX_RESOURCES = resolve(process.cwd())

const { dispatch } = await import('../registry')
const handlers = (await import('./translate')).default
const { jobs } = await import('../../jobs/manager')
const { createProject } = await import('../../project/store')
const scenarios = await import('../../scenario/store')
const { resetSettingsCache, updateSettings } = await import('../../settings/store')
const { resetResolveState } = await import('../../providers/resolve')

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
)

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

let root: string
let scenarioId: string

const call = async <T>(channel: string, req: Record<string, unknown> = {}) =>
  (await dispatch(handlers, channel as never, {
    projectPath: root,
    scenarioId,
    lang: 'es',
    ...req,
  })) as Result<T>
const ok = async <T>(channel: string, req: Record<string, unknown> = {}) => {
  const r = await call<T>(channel, req)
  if (!r.ok) throw new Error(`${channel}: ${r.error.code} ${r.error.message}`)
  return r.data
}
const translateAll = async (req: Record<string, unknown> = {}) => {
  const { jobId } = await ok<{ jobId: string }>('translate:run', req)
  return jobs.wait(jobId)
}

type Status = { items: { kind: string; id: string; status: string; flags: string[] }[] }

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  resetResolveState()
  root = (
    await createProject({ parentDir: mkdtempSync(join(tmpdir(), 'ttx-th-')), name: 'Riverbend' })
  ).path
  const s = await scenarios.createScenario(root, {
    title: 'Water',
    brief: ScenarioBrief.parse({ userPrompt: 'x' }),
  })
  scenarioId = s.id
  await scenarios.saveScenario(
    root,
    Scenario.parse({ ...FIXTURE, id: s.id, projectId: s.projectId }),
    { by: 'user' },
  )
  await scenarios.writeScenarioDoc(root, scenarioId, 'briefing', '# Hi\n\nAn EXERCISE.', {
    by: 'user',
  })
  const inject = {
    id: 'inj-1',
    mselRowId: 'I-04',
    type: 'tweet',
    title: 'Post',
    deliveryMode: 'display_main_screen',
    fields: { displayName: 'River', handle: 'River', text: 'Boil water.' },
    citations: [],
    assets: [],
    versions: [],
    includeInDeck: true,
    locked: false,
  } as Inject
  await scenarios.saveInject(root, scenarioId, inject, { by: 'user' })
})

describe('translate IPC', () => {
  it('walks the Languages panel: switch on, translate, edit, accept', async () => {
    await ok('translate:set-languages', { languages: { player: ['es'], controller: false } })
    const before = await ok<Status & { route: { providerLabel: string; cloud: boolean } }>(
      'translate:status',
    )
    expect(before.items.map((i) => i.status)).toEqual(['missing', 'missing'])
    expect(before.route).toMatchObject({ providerLabel: 'Mock (offline)', cloud: false })

    const job = await translateAll()
    expect(job.status).toBe('done')
    const after = await ok<Status>('translate:status')
    expect(after.items.map((i) => i.status)).toEqual(['machine', 'machine'])

    const text = await ok<{ source: string; translated: string }>('translate:get-item', {
      item: { kind: 'doc', id: 'briefing' },
    })
    expect(text.source).toContain('An EXERCISE.')
    expect(text.translated).toContain('[es] An EJERCICIO.')

    await ok('translate:save-item', {
      item: { kind: 'doc', id: 'briefing' },
      markdown: '# Hola\n\nUn EJERCICIO.',
    })
    const accepted = await ok<{ accepted: number }>('translate:accept')
    expect(accepted.accepted).toBe(1)
    const done = await ok<Status>('translate:status')
    expect(done.items.map((i) => i.status)).toEqual(['reviewed', 'reviewed'])
  })

  it('refuses to translate a language the scenario has not switched on', async () => {
    const { jobId } = await ok<{ jobId: string }>('translate:run')
    const job = await jobs.wait(jobId)
    expect(job.status).toBe('error')
    expect(job.error).toMatch(/not switched on/)
  })

  it('saves an inject translation as reviewed and checks it against the template', async () => {
    await ok('translate:set-languages', { languages: { player: ['es'], controller: false } })
    await translateAll()
    await ok('translate:save-item', {
      item: { kind: 'inject', id: 'inj-1' },
      title: 'Publicación',
      fields: { text: 'Hierva el agua.' },
    })
    const got = await ok<{
      translatedTitle: string
      translatedFields: { text: string }
      status: string
    }>('translate:get-item', { item: { kind: 'inject', id: 'inj-1' } })
    expect(got).toMatchObject({
      translatedTitle: 'Publicación',
      translatedFields: { text: 'Hierva el agua.' },
      status: 'reviewed',
    })
    const bad = await call('translate:save-item', {
      item: { kind: 'inject', id: 'inj-1' },
      fields: { text: 'x'.repeat(2000) },
    })
    expect(bad).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })

  it('stores the glossary and refuses a term listed twice', async () => {
    await ok('project:glossary:set', {
      entries: [{ term: 'boil water advisory', translation: 'aviso de hervir el agua' }],
    })
    const { loadProject } = await import('../../project/store')
    expect((await loadProject(root)).glossary?.es).toHaveLength(1)
    const twice = await call('project:glossary:set', {
      entries: [
        { term: 'Zone', translation: 'Zona' },
        { term: 'zone', translation: 'zona' },
      ],
    })
    expect(twice).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    const tooMany = await call('project:glossary:set', {
      entries: Array.from({ length: 501 }, (_, i) => ({ term: `t${i}`, translation: 'x' })),
    })
    expect(tooMany.ok).toBe(false)
  })

  it('uses the translate route when set, else the draft route', async () => {
    await ok('translate:set-languages', { languages: { player: ['es'], controller: false } })
    await updateSettings((s) => {
      s.providers.push({
        id: 'cloud',
        kind: 'anthropic',
        label: 'Cloud model',
        defaultModel: 'm',
        options: {},
        enabled: true,
      })
      s.defaultRouting = { draft: { providerId: 'mock' }, translate: { providerId: 'cloud' } }
    })
    const routed = await ok<{ route: { providerLabel: string; cloud: boolean } }>(
      'translate:status',
    )
    expect(routed.route).toMatchObject({ providerLabel: 'Cloud model', cloud: true })
    await updateSettings((s) => {
      s.defaultRouting = { draft: { providerId: 'mock' } }
    })
    const fallback = await ok<{ route: { providerLabel: string } }>('translate:status')
    expect(fallback.route.providerLabel).toBe('Mock (offline)')
  })
})
