// Secrets are encrypted with safeStorage and written as base64 ciphertext only.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const storage = vi.hoisted(() => ({ available: true }))
vi.mock('electron', () => ({
  app: { getPath: () => tmpdir() },
  safeStorage: {
    isEncryptionAvailable: () => storage.available,
    getSelectedStorageBackend: () => 'keychain',
    // Reversible stand-in for OS encryption: prefix + reversed text.
    encryptString: (s: string) => Buffer.from('enc:' + [...s].reverse().join('')),
    decryptString: (b: Buffer) => {
      const t = b.toString()
      if (!t.startsWith('enc:')) throw new Error('bad ciphertext')
      return [...t.slice(4)].reverse().join('')
    },
  },
}))

const { getSecret, hasSecret, setSecret, resetSecretsQueue } = await import('./index')

const KEY = 'sk-ant-test-0123456789abcdef'
const secretsFile = () => join(process.env.TTX_USER_DATA!, 'secrets.json')

describe('secrets', () => {
  beforeEach(() => {
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-secrets-'))
    storage.available = true
    resetSecretsQueue()
  })

  it('round-trips a key and stores only ciphertext', async () => {
    await setSecret('anthropic-1a2b', KEY)
    expect(await hasSecret('anthropic-1a2b')).toBe(true)
    expect(await getSecret('anthropic-1a2b')).toBe(KEY)
    const raw = readFileSync(secretsFile(), 'utf8')
    expect(raw).not.toContain(KEY)
    const stored = JSON.parse(raw) as Record<string, string>
    expect(Buffer.from(stored['anthropic-1a2b']!, 'base64').toString()).toMatch(/^enc:/)
  })

  it('writes the file readable by the owner only', async () => {
    await setSecret('p1', KEY)
    if (process.platform !== 'win32') expect(statSync(secretsFile()).mode & 0o777).toBe(0o600)
  })

  it('clears a key with null and leaves others intact', async () => {
    await setSecret('a', 'key-a')
    await setSecret('b', 'key-b')
    await setSecret('a', null)
    expect(await hasSecret('a')).toBe(false)
    expect(await getSecret('a')).toBeUndefined()
    expect(await getSecret('b')).toBe('key-b')
  })

  it('serializes concurrent writes so none are lost', async () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5']
    await Promise.all(ids.map((id) => setSecret(id, `key-${id}`)))
    for (const id of ids) expect(await getSecret(id)).toBe(`key-${id}`)
  })

  it('refuses to store when OS encryption is unavailable and never writes plaintext', async () => {
    storage.available = false
    await expect(setSecret('p1', KEY)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: expect.stringMatching(/Secure storage is not available/),
    })
    expect(() => readFileSync(secretsFile())).toThrow()
    // Clearing still works without encryption.
    await expect(setSecret('p1', null)).resolves.toBeUndefined()
  })

  it('rejects empty keys and unsafe ids', async () => {
    await expect(setSecret('p1', '   ')).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(setSecret('../evil', KEY)).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('reports an undecryptable key with a clear message', async () => {
    writeFileSync(secretsFile(), JSON.stringify({ p1: Buffer.from('garbage').toString('base64') }))
    await expect(getSecret('p1')).rejects.toMatchObject({
      code: 'PROVIDER',
      message: expect.stringMatching(/could not be decrypted/),
    })
  })
})
