// The translation store and job against a real project folder, with the mock provider:
// what is translated, the review states, staleness by hash, and what the job refuses.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Scenario, ScenarioBrief, type Inject } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_RESOURCES = resolve('.')

const { createProject } = await import('../project/store')
const { resetSettingsCache } = await import('../settings/store')
const scenarios = await import('../scenario/store')
const { MockTextProvider } = await import('../providers/mock/adapter')
const { loadPrompt, renderPrompt } = await import('../prompts')
const { runTranslation } = await import('./job')
const store = await import('./store')

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
)
const config = { id: 'mock', kind: 'mock' as const, label: 'Mock', options: {}, enabled: true }

const ctx = {
  jobId: 'job',
  signal: new AbortController().signal,
  progress: () => undefined,
  log: () => undefined,
  throwIfCancelled: () => undefined,
}

const TWEET = {
  displayName: 'Riverbend Water',
  handle: 'RiverbendWater',
  text: 'Boil water advisory for all of Zone 3. EXERCISE message.',
}

let root: string
let scenarioId: string

function deps(chat?: (req: unknown) => unknown) {
  const provider = new MockTextProvider(config)
  const wrapped = chat ? { ...provider, chat: async (r: never) => chat(r) } : provider
  return {
    resolveTextProvider: async () => ({
      provider: wrapped as never,
      model: 'mock-large',
      providerId: 'mock',
    }),
    loadPrompt,
    renderPrompt,
  }
}

const inject = (id: string, rowId: string, over: Partial<Inject> = {}): Inject =>
  ({
    id,
    mselRowId: rowId,
    type: 'tweet',
    title: `Post ${id}`,
    deliveryMode: 'display_main_screen',
    fields: TWEET,
    citations: [],
    assets: [],
    versions: [],
    includeInDeck: true,
    locked: false,
    ...over,
  }) as Inject

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  root = (
    await createProject({ parentDir: mkdtempSync(join(tmpdir(), 'ttx-tr-')), name: 'Riverbend' })
  ).path
  const s = await scenarios.createScenario(root, {
    title: 'Water',
    brief: ScenarioBrief.parse({ userPrompt: 'x' }),
  })
  scenarioId = s.id
  const parsed = Scenario.parse({ ...FIXTURE, id: s.id, projectId: s.projectId })
  const msel = [
    ...parsed.msel,
    { ...parsed.msel[1]!, id: 'I-99', toLabel: 'SimCell', toRoleIds: [] },
  ]
  await scenarios.saveScenario(
    root,
    { ...parsed, msel, languages: { player: ['es'], controller: false } },
    { by: 'user' },
  )
  await scenarios.writeScenarioDoc(
    root,
    scenarioId,
    'briefing',
    '# Welcome\n\nThis is an EXERCISE.',
    {
      by: 'user',
    },
  )
  await scenarios.saveInject(root, scenarioId, inject('inj-1', 'I-04'), { by: 'user' })
  await scenarios.saveInject(root, scenarioId, inject('inj-sim', 'I-99'), { by: 'user' })
})

const run = (over: Record<string, unknown> = {}, d = deps()) =>
  runTranslation(ctx, { root, scenarioId, lang: 'es', ...over }, d)

describe('translation job', () => {
  it('translates the briefing and the injects players see, not controller-only rows', async () => {
    const items = await store.translationItems(root, scenarioId, 'es')
    expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual(['doc:briefing', 'inject:inj-1'])
    const result = await run()
    expect(result).toMatchObject({ translated: 2, failed: [] })
    const after = await store.translationItems(root, scenarioId, 'es')
    expect(after.map((i) => i.status)).toEqual(['machine', 'machine'])
  })

  it('keeps handles and names as written and uses the glossary for the exercise marking', async () => {
    await run()
    const [saved] = (await scenarios.listInjects(root, scenarioId)).filter((i) => i.id === 'inj-1')
    const t = saved!.translations!.es!
    expect(t.title).toBe('[es] Post inj-1')
    expect(t.fields).toEqual({
      text: '[es] Boil water advisory for all of Zone 3. EJERCICIO message.',
    })
    expect(await store.readTranslatedDoc(root, scenarioId, 'briefing', 'es')).toBe(
      '# [es] Welcome\n\n[es] This is an EJERCICIO.',
    )
  })

  it('does not translate again what already has a translation, unless asked', async () => {
    await run()
    expect(await run()).toMatchObject({ translated: 0, skipped: 2 })
    expect(await run({ retranslate: true })).toMatchObject({ translated: 2 })
    expect(
      await run({ items: [{ kind: 'inject', id: 'inj-1' }], retranslate: true }),
    ).toMatchObject({ translated: 1, skipped: 1 })
  })

  it('refuses a language the scenario has not switched on', async () => {
    await scenarios.updateScenario(
      root,
      scenarioId,
      (s) => {
        s.languages = { player: [], controller: false }
      },
      { by: 'user', snapshot: false },
    )
    await expect(run()).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('reports an item whose reply is unusable and carries on with the rest', async () => {
    const real = new MockTextProvider(config)
    const bad = deps((req) => {
      const r = req as { json?: { name?: string } }
      return r.json?.name === 'TranslateDocument'
        ? { text: 'not json', model: 'm', usage: {}, finishReason: 'stop', latencyMs: 0 }
        : real.chat(req as never)
    })
    const result = await run({}, bad)
    expect(result.translated).toBe(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]!.item).toBe('Player Briefing Packet')
  })

  it('fails when nothing could be translated', async () => {
    const none = deps(() => ({
      text: '{}',
      model: 'm',
      usage: {},
      finishReason: 'stop',
      latencyMs: 0,
    }))
    await expect(run({}, none)).rejects.toThrow(/Nothing was translated/)
  })
})

describe('review states', () => {
  it('a person editing a translation makes it reviewed', async () => {
    await run()
    await store.writeTranslatedDoc(root, scenarioId, 'briefing', 'es', '# Bienvenidos', 'reviewed')
    await store.saveInjectTranslation(
      root,
      scenarioId,
      'inj-1',
      'es',
      { title: 'Publicación', fields: { text: 'Aviso de hervir el agua.' } },
      'reviewed',
    )
    const items = await store.translationItems(root, scenarioId, 'es')
    expect(items.map((i) => i.status)).toEqual(['reviewed', 'reviewed'])
  })

  it('English changed after translation: the item is stale, whatever it was before', async () => {
    await run()
    await store.acceptItems(root, scenarioId, 'es')
    await scenarios.writeScenarioDoc(root, scenarioId, 'briefing', '# Welcome\n\nChanged.', {
      by: 'user',
    })
    const [injectNow] = await scenarios.listInjects(root, scenarioId)
    await scenarios.saveInject(
      root,
      scenarioId,
      { ...injectNow!, fields: { ...TWEET, text: 'New English text.' } },
      { by: 'user' },
    )
    const items = await store.translationItems(root, scenarioId, 'es')
    expect(items.map((i) => i.status)).toEqual(['stale', 'stale'])
  })

  it('a change to a code field does not make the translation stale', async () => {
    await run()
    const [injectNow] = await scenarios.listInjects(root, scenarioId)
    await scenarios.saveInject(
      root,
      scenarioId,
      { ...injectNow!, fields: { ...TWEET, handle: 'RiverbendUtility' } },
      { by: 'user' },
    )
    const items = await store.translationItems(root, scenarioId, 'es')
    expect(items.find((i) => i.id === 'inj-1')!.status).toBe('machine')
  })

  it('accept-all never blesses a stale item; naming it does', async () => {
    await run()
    await scenarios.writeScenarioDoc(root, scenarioId, 'briefing', '# Welcome\n\nChanged.', {
      by: 'user',
    })
    expect(await store.acceptItems(root, scenarioId, 'es')).toBe(1)
    const stale = await store.translationItems(root, scenarioId, 'es')
    expect(stale.map((i) => i.status)).toEqual(['stale', 'reviewed'])
    expect(await store.acceptItems(root, scenarioId, 'es', [{ kind: 'doc', id: 'briefing' }])).toBe(
      1,
    )
    expect((await store.translationItems(root, scenarioId, 'es'))[0]!.status).toBe('reviewed')
  })

  it('flags a translation that drops a glossary term', async () => {
    await run()
    await store.writeTranslatedDoc(
      root,
      scenarioId,
      'briefing',
      'es',
      '# Hola\n\nEs un simulacro.',
      'reviewed',
    )
    const [briefing] = await store.translationItems(root, scenarioId, 'es')
    expect(briefing!.flags).toEqual(['Expected "EJERCICIO" for "EXERCISE"'])
  })

  it('refuses a translation that breaks the inject template', async () => {
    await run()
    await expect(
      store.saveInjectTranslation(
        root,
        scenarioId,
        'inj-1',
        'es',
        { title: 'x', fields: { text: 'a'.repeat(1000) } },
        'reviewed',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})
