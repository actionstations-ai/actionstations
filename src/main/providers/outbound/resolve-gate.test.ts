// No bypass (#433, Security): every provider kind that serves a task, configured as remote, comes
// out of provider resolution wrapped by the outbound gate; configured as local, it does not.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ProviderConfig, ProviderKind, ProviderTask } from '@shared/schemas'

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

const { resetSettingsCache, updateSettings } = await import('../../settings/store')
const { resetSecretsQueue, setSecret } = await import('../../secrets')
const resolve = await import('../resolve')
const { isGuarded } = await import('./gate')

function config(kind: ProviderKind, remote: boolean): ProviderConfig {
  const id = `${kind}-${remote ? 'remote' : 'local'}`
  const baseUrl = remote ? 'https://models.example.com/v1' : 'http://127.0.0.1:9/v1'
  return {
    id,
    kind,
    label: id,
    baseUrl,
    defaultModel: 'm',
    // Kinds without a host (mock, system-tts, template) are remote only when the user says so.
    options: remote ? { network: 'remote' } : {},
    enabled: true,
  }
}

async function route(task: ProviderTask, c: ProviderConfig): Promise<void> {
  await updateSettings((s) => {
    s.providers = [c]
    s.defaultRouting = { [task]: { providerId: c.id } }
  })
  if (c.kind === 'anthropic') await setSecret(c.id, 'sk-test-key')
}

async function resolved(task: ProviderTask): Promise<unknown> {
  if (task === 'embed') return (await resolve.resolveEmbeddingProvider()).provider
  if (task === 'image' || task === 'video' || task === 'audio')
    return (await resolve.resolveMediaProvider(task)).provider
  return (await resolve.resolveTextProvider(task)).provider
}

beforeEach(() => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  delete process.env.TTX_MOCK_PROVIDERS
  resetSettingsCache()
  resetSecretsQueue()
  resolve.resetResolveState()
})

const cases = Object.entries(resolve.providerTaskSupport()).flatMap(([task, kinds]) =>
  kinds.map((kind) => [task as ProviderTask, kind] as const),
)

describe('provider resolution and the outbound gate', () => {
  it('covers every task some adapter serves', () => {
    expect(new Set(cases.map(([t]) => t))).toEqual(
      new Set(['ideate', 'draft', 'critique', 'embed', 'image', 'video', 'audio']),
    )
  })

  it.each(cases)('%s via %s: a remote config is always gated', async (task, kind) => {
    await route(task, config(kind, true))
    expect(isGuarded(await resolved(task))).toBe(true)
  })

  it.each(cases.filter(([, kind]) => kind !== 'anthropic'))(
    '%s via %s: a local config is never gated',
    async (task, kind) => {
      await route(task, config(kind, false))
      expect(isGuarded(await resolved(task))).toBe(false)
    },
  )

  it('leaves the connection-test providers ungated (fixed sample text only)', async () => {
    const c = config('anthropic', true)
    await route('draft', c)
    expect(isGuarded(await resolve.connectionTestTextProvider(c))).toBe(false)
    expect(isGuarded(await resolve.textProviderFor(c))).toBe(true)
  })
})
