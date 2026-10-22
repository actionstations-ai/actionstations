// Task → provider resolution: precedence, error messages, caching, mock seeding.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'keychain',
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
}))

const { createProject, updateProject } = await import('../project/store')
const { resetSettingsCache, updateSettings } = await import('../settings/store')
const { resetSecretsQueue } = await import('../secrets')
const {
  forgetProvider,
  mergeRouting,
  providerTaskSupport,
  resetResolveState,
  resolveEmbeddingProvider,
  resolveMediaProvider,
  resolveTextProvider,
} = await import('./resolve')

type Config = {
  id: string
  kind: 'mock' | 'anthropic' | 'openai-compatible'
  label: string
  baseUrl?: string
  defaultModel?: string
  enabled?: boolean
}

async function seed(providers: Config[], defaultRouting: Record<string, unknown> = {}) {
  await updateSettings((s) => {
    s.providers = providers.map((p) => ({ options: {}, enabled: true, ...p }))
    s.defaultRouting = defaultRouting
  })
}

async function newProject(routing: Record<string, unknown>): Promise<string> {
  const parent = mkdtempSync(join(tmpdir(), 'ttx-proj-'))
  const { path } = await createProject({ parentDir: parent, name: 'Rivergate' })
  await updateProject(path, (p) => {
    p.providerRouting = routing
  })
  return path
}

const A: Config = { id: 'alpha', kind: 'mock', label: 'Alpha', defaultModel: 'mock-large' }
const B: Config = { id: 'beta', kind: 'mock', label: 'Beta', defaultModel: 'mock-small' }

beforeEach(() => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  delete process.env.TTX_MOCK_PROVIDERS
  resetSettingsCache()
  resetSecretsQueue()
  resetResolveState()
})

describe('mergeRouting', () => {
  it('lets project entries win task by task', () => {
    expect(
      mergeRouting(
        { draft: { providerId: 'g' }, ideate: { providerId: 'g' } },
        { draft: { providerId: 'p', model: 'm' } },
      ),
    ).toEqual({ draft: { providerId: 'p', model: 'm' }, ideate: { providerId: 'g' } })
    expect(mergeRouting({ draft: { providerId: 'g' } })).toEqual({ draft: { providerId: 'g' } })
  })
})

describe('resolveTextProvider', () => {
  it('uses global routing and the provider default model', async () => {
    await seed([A], { draft: { providerId: 'alpha' } })
    const r = await resolveTextProvider('draft')
    expect(r).toMatchObject({ providerId: 'alpha', model: 'mock-large' })
    expect(r.provider.kind).toBe('mock')
  })

  it('prefers the project override and its model', async () => {
    await seed([A, B], { draft: { providerId: 'alpha' }, critique: { providerId: 'alpha' } })
    const path = await newProject({ draft: { providerId: 'beta', model: 'beta-x' } })
    expect(await resolveTextProvider('draft', path)).toMatchObject({
      providerId: 'beta',
      model: 'beta-x',
    })
    expect(await resolveTextProvider('critique', path)).toMatchObject({ providerId: 'alpha' })
  })

  it('explains an unassigned task', async () => {
    await seed([A])
    await expect(resolveTextProvider('draft')).rejects.toMatchObject({
      code: 'VALIDATION',
      message: "No provider is assigned to 'draft'. Assign one in Providers → Routing.",
    })
  })

  it('explains a missing, disabled, model-less or keyless provider', async () => {
    await seed(
      [
        { ...A, enabled: false },
        { id: 'nomodel', kind: 'mock', label: 'No Model' },
        { id: 'claude', kind: 'anthropic', label: 'Anthropic', defaultModel: 'x' },
      ],
      {
        ideate: { providerId: 'gone' },
        draft: { providerId: 'alpha' },
        critique: { providerId: 'nomodel' },
      },
    )
    await expect(resolveTextProvider('ideate')).rejects.toThrow(
      /provider assigned to 'ideate' \("gone"\) no longer exists/,
    )
    await expect(resolveTextProvider('draft')).rejects.toThrow(
      /"Alpha" assigned to 'draft' is disabled/,
    )
    await expect(resolveTextProvider('critique')).rejects.toThrow(
      /No model is chosen for 'critique' on "No Model"/,
    )
    await updateSettings((s) => {
      s.defaultRouting.critique = { providerId: 'claude' }
    })
    await expect(resolveTextProvider('critique')).rejects.toThrow(/"Anthropic" needs an API key/)
  })

  it('caches instances until the provider changes', async () => {
    await seed([A], { draft: { providerId: 'alpha' }, critique: { providerId: 'alpha' } })
    const first = (await resolveTextProvider('draft')).provider
    expect((await resolveTextProvider('critique')).provider).toBe(first)
    forgetProvider('alpha')
    expect((await resolveTextProvider('draft')).provider).not.toBe(first)
    const second = (await resolveTextProvider('draft')).provider
    await updateSettings((s) => {
      s.providers[0]!.defaultModel = 'mock-small'
    })
    expect((await resolveTextProvider('draft')).provider).not.toBe(second)
  })
})

describe('resolveMediaProvider / resolveEmbeddingProvider', () => {
  it('resolves media without requiring a model', async () => {
    await seed([{ id: 'm', kind: 'mock', label: 'M' }], { image: { providerId: 'm' } })
    const r = await resolveMediaProvider('image')
    expect(r.providerId).toBe('m')
    expect(r.provider.capabilities().has('image')).toBe(true)
    await expect(resolveMediaProvider('video')).rejects.toThrow(
      /No provider is assigned to 'video'/,
    )
  })

  it('resolves embeddings with the routed model', async () => {
    await seed([A], { embed: { providerId: 'alpha', model: 'hash' } })
    const r = await resolveEmbeddingProvider()
    expect(r).toMatchObject({ providerId: 'alpha', model: 'hash' })
    expect((await r.provider.embed(['FIDS outage']))[0]).toBeInstanceOf(Float32Array)
  })
})

describe('task support and capability checks (#113, #114)', () => {
  const TTS: Config = {
    id: 'tts',
    kind: 'openai-compatible',
    label: 'mlx-audio',
    baseUrl: 'http://127.0.0.1:8765/v1',
    defaultModel: 'mlx-community/VoxCPM2-8bit',
  }

  it('derives task support from adapter capabilities', () => {
    const support = providerTaskSupport()
    expect(support.audio).toEqual(expect.arrayContaining(['openai-compatible', 'comfyui', 'mock']))
    expect(support.image).not.toContain('openai-compatible')
    expect(support.image).toEqual(expect.arrayContaining(['comfyui', 'mock']))
    expect(support.embed).toEqual(expect.arrayContaining(['openai-compatible', 'ollama']))
    expect(support.embed).not.toContain('anthropic')
    expect(support.draft).toEqual(expect.arrayContaining(['anthropic', 'openai-compatible']))
    expect(support.draft).not.toContain('comfyui')
  })

  it('keeps the Providers screen task list in step with the adapters', async () => {
    // The renderer is a separate TS project, so load its catalog by URL (types stay local).
    const catalogUrl = new URL('../../renderer/src/routes/providers/catalog.ts', import.meta.url)
    const { TASKS } = (await import(/* @vite-ignore */ catalogUrl.href)) as {
      TASKS: { task: keyof ReturnType<typeof providerTaskSupport>; kinds: string[] }[]
    }
    expect(TASKS.length).toBe(7)
    const support = providerTaskSupport()
    for (const info of TASKS)
      expect([...info.kinds].sort(), info.task).toEqual([...support[info.task]].sort())
  })

  it('routes audio to an OpenAI-compatible TTS server and refuses image there', async () => {
    await seed([TTS], { audio: { providerId: 'tts' }, image: { providerId: 'tts' } })
    expect((await resolveMediaProvider('audio')).providerId).toBe('tts')
    await expect(resolveMediaProvider('image')).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringMatching(/"mlx-audio" cannot generate image/),
    })
  })

  it('embedding mode "provider" uses the global Embeddings routing row', async () => {
    const { createEmbedder } = await import('./embedding/factory')
    await seed([A], { embed: { providerId: 'alpha', model: 'hash' } })
    const e = await createEmbedder(
      { mode: 'provider', model: 'ignored' },
      { modelsDir: tmpdir(), providers: [] },
    )
    expect(e.dims).toBe(384)
    expect((await e.embed(['FIDS outage']))[0]).toHaveLength(384)
  })

  it('embedding mode "provider" reads the project override', async () => {
    const { createEmbedder } = await import('./embedding/factory')
    await seed([A])
    const path = await newProject({ embed: { providerId: 'alpha', model: 'hash' } })
    const settings = { mode: 'provider' as const, model: 'ignored' }
    const deps = { modelsDir: tmpdir(), providers: [] }
    await expect(createEmbedder(settings, deps)).rejects.toThrow(/Embeddings row/)
    const e = await createEmbedder(settings, { ...deps, projectPath: path })
    expect(e.dims).toBe(384)
  })
})

describe('TTX_MOCK_PROVIDERS', () => {
  it('routes every task to the mock provider when routing is empty', async () => {
    process.env.TTX_MOCK_PROVIDERS = '1'
    expect(await resolveTextProvider('draft')).toMatchObject({
      providerId: 'mock',
      model: 'mock-large',
    })
    expect((await resolveMediaProvider('audio')).providerId).toBe('mock')
  })

  it('leaves existing routing alone', async () => {
    await seed([A], { draft: { providerId: 'alpha' } })
    process.env.TTX_MOCK_PROVIDERS = '1'
    expect((await resolveTextProvider('draft')).providerId).toBe('alpha')
    await expect(resolveTextProvider('ideate')).rejects.toThrow(/No provider is assigned/)
  })
})
