// case:keys and the api.data.gov key through the IPC dispatcher: the key goes to secure storage,
// is never returned or written to a settings file, and the FBI connector reads it from there.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const electron = vi.hoisted(() => ({
  shell: { openExternal: vi.fn(async (_url: string) => undefined) },
}))
vi.mock('electron', () => ({
  app: { getVersion: () => '0.9.0', isPackaged: false, getPath: () => tmpdir(), on: vi.fn() },
  shell: electron.shell,
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'keychain',
    encryptString: (s: string) => Buffer.from('enc:' + s),
    decryptString: (b: Buffer) => b.toString().slice(4),
  },
}))

const { dispatch } = await import('../registry')
const handlers = (await import('./case-data')).default
const { resetSettingsCache } = await import('../../settings/store')
const { resetSecretsQueue } = await import('../../secrets')
const { FBI_CDE_SIGNUP_URL, createFbiCdeConnector } =
  await import('../../toolkits/connectors/fbi-cde-crime')

// gitleaks:allow (a made-up test key)
const KEY = 'abcdefghij0123456789ABCDEFGHIJ0123456789' // gitleaks:allow (a made-up test key)

async function call<T = unknown>(channel: string, req?: unknown): Promise<T> {
  const res = await dispatch(handlers, channel, req)
  if (!res.ok) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}

beforeEach(() => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-case-keys-'))
  resetSettingsCache()
  resetSecretsQueue()
})

describe('case data keys', () => {
  it('starts with no key and saves, reports and removes one', async () => {
    expect(await call('case:keys')).toEqual({ hasFbiCdeKey: false, encryptionAvailable: true })
    expect(await call('case:fbi-cde-key-set', { key: KEY })).toMatchObject({ hasFbiCdeKey: true })
    const files = readdirSync(process.env.TTX_USER_DATA!, { recursive: true, encoding: 'utf8' })
    for (const f of files.filter((n) => n.endsWith('.json')))
      expect(readFileSync(join(process.env.TTX_USER_DATA!, f), 'utf8'), f).not.toContain(KEY)
    expect(await call('case:fbi-cde-key-remove')).toMatchObject({ hasFbiCdeKey: false })
  })

  it('refuses a key that is not an api.data.gov key', async () => {
    await expect(call('case:fbi-cde-key-set', { key: 'not a key' })).rejects.toThrow(/40 letters/)
    expect(await call('case:keys')).toMatchObject({ hasFbiCdeKey: false })
  })

  it('the FBI connector reads the saved key from secure storage', async () => {
    await call('case:fbi-cde-key-set', { key: KEY })
    const asked: string[] = []
    const fbi = createFbiCdeConnector()
    const body = JSON.stringify({ offenses: { actuals: { 'Ohio Offenses': { '01-2023': 1 } } } })
    await fbi.fetch(
      {
        range: { start: '2023-01-01T00:00:00Z', end: '2023-01-31T00:00:00Z' },
        area: { label: '' },
        options: { state: 'OH' },
      },
      {
        get: async (u) => {
          asked.push(u)
          return { status: 200, data: new TextEncoder().encode(body) }
        },
      },
    )
    expect(new URL(asked[0]!).searchParams.get('API_KEY')).toBe(KEY)
  })

  it('opens the sign-up page in the browser', async () => {
    await call('case:fbi-cde-signup-open')
    expect(electron.shell.openExternal).toHaveBeenCalledWith(FBI_CDE_SIGNUP_URL)
  })
})
