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
const { chunkedResponse, stubFetch } = await import('../../providers/text/test-fixtures')

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

  it('clears the re-entry notice for a provider once its key is entered again (#277)', async () => {
    const a = await addMock({ label: 'A' })
    const b = await addMock({ label: 'B' })
    const { updateSettings } = await import('../../settings/store')
    await updateSettings((s) => {
      s.keyReentry = { providerIds: [a.id, b.id], dismissed: false }
    })
    await addMock({ id: a.id, label: 'A' })
    expect((await getSettings()).keyReentry?.providerIds).toEqual([a.id, b.id])
    await addMock({ id: a.id, label: 'A' }, KEY)
    expect((await getSettings()).keyReentry?.providerIds).toEqual([b.id])
    await call('providers:remove', { id: b.id })
    expect((await getSettings()).keyReentry?.providerIds).toEqual([])
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

describe('providers:upsert: "On my network, treat as local" (#454 review, finding 3)', () => {
  const upsert = (baseUrl: string, options: Record<string, unknown>) =>
    call('providers:upsert', {
      config: { kind: 'openai-compatible', label: 'LAN', baseUrl, options },
    })

  it('accepts a private host with the host it was granted for', async () => {
    await expect(
      upsert('http://192.168.1.20:1234/v1', { network: 'local', localHost: '192.168.1.20' }),
    ).resolves.toBeTruthy()
  })

  it('refuses a public host', async () => {
    await expect(
      upsert('https://api.openai.com/v1', { network: 'local', localHost: 'api.openai.com' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('refuses a mark granted for another host (the base URL changed)', async () => {
    await expect(
      upsert('http://10.0.0.9:1234/v1', { network: 'local', localHost: '192.168.1.20' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(upsert('http://10.0.0.9:1234/v1', { network: 'local' })).rejects.toMatchObject({
      code: 'VALIDATION',
    })
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
      config: { kind: 'template', label: 'Templates' },
    })
    const health = await call<{ ok: boolean; message: string }>('providers:health', {
      id: view.id,
    })
    expect(health.ok).toBe(false)
    expect(health.message).toMatch(/No adapter|does not provide/)
  })
})

describe('providers:test-speech', () => {
  afterEach(() => vi.unstubAllGlobals())
  type SpeechResult = { ok: boolean; dataUrl?: string; durationSec?: number; error?: string }

  it('speaks a capped line through an OpenAI-compatible TTS server and returns a data URL', async () => {
    const { silentWav } = await import('../../providers/text/openai-compatible/wav')
    const calls = stubFetch([
      new Response(silentWav(0.5), { headers: { 'content-type': 'audio/wav' } }),
    ])
    const { id } = await call<{ id: string }>('providers:upsert', {
      config: {
        kind: 'openai-compatible',
        label: 'mlx-audio',
        baseUrl: 'http://127.0.0.1:8765/v1',
        options: { ttsModel: 'mlx-community/VoxCPM2-8bit' },
      },
    })
    const res = await call<SpeechResult>('providers:test-speech', {
      id,
      text: 'x'.repeat(500),
      voiceStyle: 'calm dispatcher',
    })
    expect(res).toMatchObject({ ok: true, durationSec: 0.5 })
    expect(res.dataUrl).toMatch(/^data:audio\/wav;base64,UklGR/)
    expect(calls[0]!.url).toBe('http://127.0.0.1:8765/v1/audio/speech')
    expect((calls[0]!.body as { input: string }).input).toHaveLength(200)
  })

  it('reports providers without speech as a failed test', async () => {
    const res = await call<SpeechResult>('providers:test-speech', {
      id: (
        await call<{ id: string }>('providers:upsert', {
          config: { kind: 'ollama', label: 'O', baseUrl: 'http://127.0.0.1:11434' },
        })
      ).id,
    })
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
  })
})

describe('providers:detect-local', () => {
  it('probes LM Studio, Ollama and ComfyUI, then lists the system voice only when installed', async () => {
    const found =
      await call<{ label: string; kind: string; reachable: boolean }[]>('providers:detect-local')
    expect(found.slice(0, 3).map((f) => f.label)).toEqual(['LM Studio', 'Ollama', 'ComfyUI'])
    for (const f of found) expect(typeof f.reachable).toBe('boolean')
    const { findEngine } = await import('../../providers/media/system-tts/detect')
    const voice = found.slice(3)
    expect(voice.map((f) => f.kind)).toEqual(findEngine() ? ['system-tts'] : [])
    for (const f of voice) expect(f.reachable).toBe(true)
  })
})

describe('providers:task-support', () => {
  it('lists, per task, the adapter kinds and configured providers that can serve it', async () => {
    const mock = await addMock()
    const comfy = await call<{ id: string }>('providers:upsert', {
      config: { kind: 'comfyui', label: 'ComfyUI', baseUrl: 'http://127.0.0.1:8188' },
    })
    const lm = await call<{ id: string }>('providers:upsert', {
      config: {
        kind: 'openai-compatible',
        label: 'LM Studio',
        baseUrl: 'http://127.0.0.1:1234/v1',
        enabled: false,
      },
    })
    const support =
      await call<Record<string, { kinds: string[]; providerIds: string[] }>>(
        'providers:task-support',
      )
    expect(Object.keys(support).sort()).toEqual(
      [
        'audio',
        'critique',
        'draft',
        'embed',
        'ideate',
        'image',
        'roleplay',
        'transcribe',
        'translate',
        'video',
      ].sort(),
    )
    expect(support.draft!.kinds).toEqual(expect.arrayContaining(['anthropic', 'openai-compatible']))
    expect(support.draft!.providerIds.sort()).toEqual([lm.id, mock.id].sort())
    expect(support.image!.providerIds.sort()).toEqual([comfy.id, mock.id].sort())
    expect(support.embed!.providerIds).not.toContain(comfy.id)
    expect(support.audio!.providerIds).toEqual(expect.arrayContaining([comfy.id, lm.id]))
    // Transcription (#425): built-in Whisper, the mock and local OpenAI-compatible servers.
    expect(support.transcribe!.kinds).toEqual(
      expect.arrayContaining(['local-whisper', 'mock', 'openai-compatible']),
    )
    expect(support.transcribe!.providerIds.sort()).toEqual([lm.id, mock.id].sort())
  })

  it('never offers a remote server for transcription', async () => {
    const remote = await call<{ id: string }>('providers:upsert', {
      config: { kind: 'openai-compatible', label: 'Hosted', baseUrl: 'https://api.example.com/v1' },
    })
    const support =
      await call<Record<string, { kinds: string[]; providerIds: string[] }>>(
        'providers:task-support',
      )
    expect(support.draft!.providerIds).toContain(remote.id)
    expect(support.transcribe!.providerIds).not.toContain(remote.id)
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
      [
        'audio',
        'critique',
        'draft',
        'embed',
        'ideate',
        'image',
        'roleplay',
        'transcribe',
        'translate',
        'video',
      ].sort(),
    )
  })
})

describe('providers:pull-model', () => {
  afterEach(() => vi.unstubAllGlobals())
  const OLLAMA = { kind: 'ollama', label: 'Ollama', baseUrl: 'http://127.0.0.1:11434' }
  const PULL_STREAM = [
    '{"status":"pulling manifest"}',
    '{"status":"pulling 3f9a","completed":0,"total":2000000000}',
    '{"status":"pulling 3f9a","completed":1000000000,"total":2000000000}',
    '{"status":"pulling 3f9a","completed":2000000000,"total":2000000000}',
    '{"status":"verifying sha256 digest"}',
    '{"status":"success"}',
  ].join('\n')

  it('pulls through the Ollama adapter as a job with byte progress', async () => {
    const { jobs } = await import('../../jobs/manager')
    const calls = stubFetch([chunkedResponse(PULL_STREAM + '\n')])
    const { id } = await call<{ id: string }>('providers:upsert', { config: OLLAMA })
    const { jobId } = await call<{ jobId: string }>('providers:pull-model', {
      id,
      model: 'smollm:135m',
    })
    const done = await jobs.wait(jobId)
    expect(done).toMatchObject({
      status: 'done',
      payload: { providerId: id, model: 'smollm:135m' },
    })
    expect(calls[0]).toMatchObject({
      url: 'http://127.0.0.1:11434/api/pull',
      body: { model: 'smollm:135m', stream: true },
    })
  })

  it('formats layer progress in GB and plain statuses as-is', async () => {
    const { pullProgressMessage } = await import('./providers')
    expect(
      pullProgressMessage('qwen3:4b', { status: 'pulling 3f9a', completed: 1.5e9, total: 3e9 }),
    ).toBe('qwen3:4b: pulling 3f9a 1.50 / 3.00 GB')
    expect(pullProgressMessage('qwen3:4b', { status: 'success' })).toBe('qwen3:4b: success')
  })

  it('surfaces Ollama errors as a failed job and refuses non-Ollama providers', async () => {
    const { jobs } = await import('../../jobs/manager')
    stubFetch([chunkedResponse('{"error":"pull model manifest: file does not exist"}\n')])
    const { id } = await call<{ id: string }>('providers:upsert', { config: OLLAMA })
    const { jobId } = await call<{ jobId: string }>('providers:pull-model', {
      id,
      model: 'nope:1b',
    })
    const failed = await jobs.wait(jobId)
    expect(failed.status).toBe('error')
    expect(failed.error).toMatch(/file does not exist/)

    const mock = await addMock()
    await expect(
      call('providers:pull-model', { id: mock.id, model: 'x:1b' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})
