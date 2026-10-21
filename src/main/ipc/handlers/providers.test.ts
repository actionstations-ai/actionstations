// Integration: providers:* and routing:* through the IPC dispatcher (request + response
// validation included) with a temp userData dir and a stand-in for OS encryption.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const storage = vi.hoisted(() => ({ available: true }))
vi.mock('electron', () => ({
  app: { on: vi.fn(), getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: {
    isEncryptionAvailable: () => storage.available,
    getSelectedStorageBackend: () => 'keychain',
    encryptString: (s: string) => Buffer.from('enc:' + [...s].reverse().join('')),
    decryptString: (b: Buffer) => [...b.toString().slice(4)].reverse().join(''),
  },
}))

const { dispatch } = await import('../registry')
const handlers = (await import('./providers')).default
const { createProject, loadProject } = await import('../../project/store')
const { getSettings, resetSettingsCache } = await import('../../settings/store')
const { getSecret, resetSecretsQueue } = await import('../../secrets')
const { resetResolveState } = await import('../../providers/resolve')
const { clearMockResponses, setMockResponse } = await import('../../providers/mock/adapter')

const KEY = 'sk-test-SUPERSECRET-0123456789'
const MOCK = { kind: 'mock', label: 'Mock LLM', defaultModel: 'mock-large' }

async function call<T = unknown>(channel: string, req?: unknown): Promise<T> {
  const res = await dispatch(handlers, channel, req)
  if (!res.ok) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}

async function addMock(over: Record<string, unknown> = {}, apiKey?: string | null) {
  return call<{ id: string; hasKey: boolean }>('providers:upsert', {
    config: { ...MOCK, ...over },
    ...(apiKey !== undefined ? { apiKey } : {}),
  })
}

async function newProject(): Promise<string> {
  const parent = mkdtempSync(join(tmpdir(), 'ttx-proj-'))
  return (await createProject({ parentDir: parent, name: 'Rivergate' })).path
}

const userData = () => process.env.TTX_USER_DATA!

beforeEach(() => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  delete process.env.TTX_MOCK_PROVIDERS
  storage.available = true
  resetSettingsCache()
  resetSecretsQueue()
  resetResolveState()
})
afterEach(() => clearMockResponses())

describe('providers:upsert / list', () => {
  it('creates a provider with a slug id, stores the key only in secrets', async () => {
    const view = await addMock({ label: 'LM Studio (desk)' }, KEY)
    expect(view.id).toMatch(/^lm-studio-desk-[0-9a-f]{4}$/)
    expect(view.hasKey).toBe(true)
    expect(JSON.stringify(view)).not.toContain(KEY)

    const list = await call<unknown[]>('providers:list')
    expect(list).toEqual([expect.objectContaining({ id: view.id, hasKey: true })])
    expect(JSON.stringify(list)).not.toContain(KEY)
    expect(readFileSync(join(userData(), 'settings.json'), 'utf8')).not.toContain(KEY)
    expect(readFileSync(join(userData(), 'secrets.json'), 'utf8')).not.toContain(KEY)
    expect(await getSecret(view.id)).toBe(KEY)
  })

  it('keeps the key when apiKey is omitted and clears it on null', async () => {
    const { id } = await addMock({}, KEY)
    const kept = await addMock({ id, label: 'Renamed' })
    expect(kept).toMatchObject({ id, label: 'Renamed', hasKey: true })
    const cleared = await addMock({ id }, null)
    expect(cleared.hasKey).toBe(false)
    expect(await getSecret(id)).toBeUndefined()
    expect((await getSettings()).providers).toHaveLength(1)
  })

  it('refuses to save anything when secure storage is unavailable', async () => {
    storage.available = false
    await expect(addMock({}, KEY)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect((await getSettings()).providers).toEqual([])
    // Without a key the provider can still be saved.
    await expect(addMock()).resolves.toMatchObject({ hasKey: false })
  })

  it('rejects credentials in options and missing base URLs', async () => {
    await expect(addMock({ options: { apiKey: KEY } })).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringMatching(/looks like a credential/),
    })
    await expect(
      call('providers:upsert', { config: { kind: 'openai-compatible', label: 'Custom' } }),
    ).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringMatching(/base URL/) })
    await expect(
      call('providers:upsert', {
        config: { kind: 'openai-compatible', label: 'Bad', baseUrl: 'file:///etc/passwd' },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})

describe('providers:remove', () => {
  it('deletes the config, its key and global routing that pointed at it', async () => {
    const a = await addMock({ label: 'A' }, KEY)
    const b = await addMock({ label: 'B' })
    await call('routing:set', {
      scope: 'global',
      routing: { draft: { providerId: a.id }, critique: { providerId: b.id } },
    })
    await call('providers:remove', { id: a.id })
    expect((await getSettings()).providers.map((p) => p.id)).toEqual([b.id])
    expect(await getSecret(a.id)).toBeUndefined()
    expect((await getSettings()).defaultRouting).toEqual({ critique: { providerId: b.id } })
    await expect(call('providers:remove', { id: a.id })).rejects.toMatchObject({
      code: 'VALIDATION',
    })
  })
})

describe('providers:health / models / test', () => {
  it('reports health with latency and lists models', async () => {
    const { id } = await addMock()
    expect(await call('providers:health', { id })).toMatchObject({ ok: true, latencyMs: 0 })
    const models = await call<{ id: string }[]>('providers:models', { id })
    expect(models.map((m) => m.id)).toEqual(['mock-large', 'mock-small'])
  })

  it('sends a tiny chat and reports the sample and latency', async () => {
    const { id } = await addMock()
    const seen: unknown[] = []
    setMockResponse('*', (req) => {
      seen.push(req)
      return 'OK'
    })
    const res = await call<{ ok: boolean; sample: string; latencyMs: number }>('providers:test', {
      id,
      model: 'mock-small',
    })
    expect(res).toMatchObject({ ok: true, sample: 'OK' })
    expect(res.latencyMs).toBeGreaterThanOrEqual(0)
    expect(seen[0]).toMatchObject({
      model: 'mock-small',
      maxTokens: 8,
      messages: [{ role: 'user', content: 'Reply with the single word OK' }],
    })
  })

  it('reports failures without leaking the key', async () => {
    const { id } = await addMock({}, KEY)
    setMockResponse('*', () => {
      throw new Error(`401 Unauthorized for key ${KEY}`)
    })
    const res = await call<{ ok: boolean; error: string }>('providers:test', { id })
    expect(res.ok).toBe(false)
    expect(res.error).toContain('401 Unauthorized')
    expect(res.error).not.toContain(KEY)
  })

  it('returns a failed health result for a kind with no adapter instead of throwing', async () => {
    const view = await call<{ id: string }>('providers:upsert', {
      config: { kind: 'system-tts', label: 'Voice' },
    })
    const health = await call<{ ok: boolean; message: string }>('providers:health', {
      id: view.id,
    })
    expect(health.ok).toBe(false)
    expect(health.message).toMatch(/No adapter|does not provide/)
  })
})

describe('providers:detect-local', () => {
  it('probes LM Studio, Ollama and ComfyUI', async () => {
    const found = await call<{ label: string; reachable: boolean }[]>('providers:detect-local')
    expect(found.map((f) => f.label)).toEqual(['LM Studio', 'Ollama', 'ComfyUI'])
    for (const f of found) expect(typeof f.reachable).toBe('boolean')
  })
})

describe('routing:get / set', () => {
  it('stores global routing in settings and project overrides in project.json', async () => {
    const g = await addMock({ label: 'Global' })
    const p = await addMock({ label: 'Local' })
    const path = await newProject()
    await call('routing:set', {
      scope: 'global',
      routing: { draft: { providerId: g.id }, ideate: { providerId: g.id, model: 'mock-small' } },
    })
    const view = await call('routing:set', {
      scope: 'project',
      projectPath: path,
      routing: { draft: { providerId: p.id, model: 'mock-small' } },
    })
    expect(view).toEqual({
      global: { draft: { providerId: g.id }, ideate: { providerId: g.id, model: 'mock-small' } },
      project: { draft: { providerId: p.id, model: 'mock-small' } },
      effective: {
        draft: { providerId: p.id, model: 'mock-small' },
        ideate: { providerId: g.id, model: 'mock-small' },
      },
    })
    expect((await loadProject(path)).providerRouting).toEqual({
      draft: { providerId: p.id, model: 'mock-small' },
    })
    expect(await call('routing:get', {})).toEqual({
      global: expect.any(Object),
      effective: expect.objectContaining({ draft: { providerId: g.id } }),
    })
  })

  it('rejects unknown providers and unopened project folders', async () => {
    await expect(
      call('routing:set', { scope: 'global', routing: { draft: { providerId: 'nope' } } }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    const stranger = mkdtempSync(join(tmpdir(), 'ttx-x-'))
    await expect(call('routing:get', { projectPath: stranger })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(call('routing:set', { scope: 'project', routing: {} })).rejects.toMatchObject({
      code: 'VALIDATION',
    })
  })

  it('seeds a mock provider for every task when TTX_MOCK_PROVIDERS=1', async () => {
    process.env.TTX_MOCK_PROVIDERS = '1'
    const list = await call<{ id: string; kind: string }[]>('providers:list')
    expect(list).toEqual([expect.objectContaining({ id: 'mock', kind: 'mock' })])
    const { effective } = await call<{ effective: Record<string, unknown> }>('routing:get', {})
    expect(Object.keys(effective).sort()).toEqual(
      ['audio', 'critique', 'draft', 'embed', 'ideate', 'image', 'video'].sort(),
    )
  })
})
