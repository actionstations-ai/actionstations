// Every hosted text preset is a cloud provider: it is gated when resolved, needs a key, and is
// remote even if its address were a loopback host.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ProviderConfig } from '@shared/schemas'
import { HOSTED_PRESETS } from '@shared/hosted-presets'
import { isRemoteProvider } from '@shared/provider-network'

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

const IDS = HOSTED_PRESETS.map((p) => p.id)

const configOf = (id: string): ProviderConfig => {
  const p = HOSTED_PRESETS.find((x) => x.id === id)!
  return {
    id: `${id}-1`,
    kind: 'openai-compatible',
    label: p.label,
    baseUrl: p.baseUrl,
    defaultModel: p.defaultModel || 'deployment',
    options: p.options,
    enabled: true,
  }
}

async function route(c: ProviderConfig): Promise<void> {
  await updateSettings((s) => {
    s.providers = [c]
    s.defaultRouting = { draft: { providerId: c.id }, embed: { providerId: c.id, model: 'm' } }
  })
}

beforeEach(() => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-hg-'))
  delete process.env.TTX_MOCK_PROVIDERS
  resetSettingsCache()
  resetSecretsQueue()
  resolve.resetResolveState()
})

describe('hosted text presets and the cloud gate', () => {
  it.each(IDS)('%s is a cloud provider', (id) => {
    expect(isRemoteProvider(configOf(id))).toBe(true)
    expect(isRemoteProvider({ ...configOf(id), baseUrl: 'http://127.0.0.1:9/v1' })).toBe(true)
  })

  it.each(IDS)('%s is gated for writing and embeddings', async (id) => {
    const c = configOf(id)
    await route(c)
    await setSecret(c.id, 'test-key-0000')
    expect(isGuarded((await resolve.resolveTextProvider('draft')).provider)).toBe(true)
    expect(isGuarded((await resolve.resolveEmbeddingProvider()).provider)).toBe(true)
  })

  it.each(IDS)('%s refuses to run without a key', async (id) => {
    await route(configOf(id))
    await expect(resolve.resolveTextProvider('draft')).rejects.toThrow(/needs an API key/)
  })

  it('a generic OpenAI-compatible provider still runs without a key', async () => {
    await route({ ...configOf('openai'), id: 'lan', options: {} })
    await expect(resolve.resolveTextProvider('draft')).resolves.toBeDefined()
  })
})
