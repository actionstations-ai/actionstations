// Secret storage (#21): API keys encrypted with Electron safeStorage in userData/secrets.json.
// The file holds only ciphertext: { [providerId]: base64(encryptString(key)) }.
// Keys never go to project folders, settings.json, logs, or the renderer.
import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { safeStorage } from 'electron'
import { SafeId } from '@shared/schemas/common'
import { AppError } from '../lib/errors'
import { writeFileAtomic } from '../lib/fs'
import { userDataPath } from '../lib/paths'

type SecretMap = Record<string, string>

const secretsFile = (): string => userDataPath('secrets.json')

let chain: Promise<unknown> = Promise.resolve()

/** Run read-modify-write operations one at a time so concurrent setSecret calls never clobber. */
function serialized<T>(op: () => Promise<T>): Promise<T> {
  const run = chain.catch(() => undefined).then(op)
  chain = run
  return run
}

function checkId(providerId: string): void {
  if (!SafeId.safeParse(providerId).success)
    throw new AppError('VALIDATION', 'Invalid provider id for secret storage')
}

async function readMap(): Promise<SecretMap> {
  let raw: string
  try {
    raw = await fs.readFile(secretsFile(), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw e
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string'),
    )
  } catch {
    throw new AppError('INTERNAL', 'secrets.json is corrupt; re-enter your API keys')
  }
}

async function writeMap(map: SecretMap): Promise<void> {
  const path = secretsFile()
  await writeFileAtomic(path, JSON.stringify(map, null, 2) + '\n')
  await fs.chmod(path, 0o600).catch(() => undefined)
}

/**
 * Whether the OS can encrypt for us. Linux without a keyring falls back to a hard-coded
 * key ("basic_text"), which is obfuscation, not encryption — treat it as unavailable.
 */
export function encryptionAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend?.() === 'basic_text')
    return false
  return true
}

function requireEncryption(): void {
  if (!encryptionAvailable())
    throw new AppError(
      'FORBIDDEN',
      'Secure storage is not available on this computer (no OS keychain), so API keys cannot be saved. Unlock or install a keyring and try again.',
    )
}

export async function getSecret(providerId: string): Promise<string | undefined> {
  checkId(providerId)
  const cipher = (await readMap())[providerId]
  if (cipher === undefined) return undefined
  requireEncryption()
  try {
    return safeStorage.decryptString(Buffer.from(cipher, 'base64'))
  } catch {
    throw new AppError(
      'PROVIDER',
      `The stored API key for provider "${providerId}" could not be decrypted. Enter it again in Providers.`,
    )
  }
}

/** Store (string) or clear (null) a provider's key. Refuses to store when encryption is unavailable. */
export async function setSecret(providerId: string, value: string | null): Promise<void> {
  checkId(providerId)
  if (value !== null) {
    if (value.trim() === '') throw new AppError('VALIDATION', 'API key is empty')
    requireEncryption()
  }
  return serialized(async () => {
    const map = await readMap()
    if (value === null) {
      if (!(providerId in map)) return
      delete map[providerId]
    } else {
      map[providerId] = safeStorage.encryptString(value.trim()).toString('base64')
    }
    await writeMap(map)
  })
}

function decrypts(cipher: string): boolean {
  try {
    safeStorage.decryptString(Buffer.from(cipher, 'base64'))
    return true
  } catch {
    return false
  }
}

/**
 * After the settings folder moved (#277): find keys this install cannot decrypt (written
 * under another OS keychain entry). The whole encrypted file is first copied aside to
 * `secrets.unreadable-<time>.json`, then those keys are removed from secrets.json so the
 * providers show "no key" instead of failing on every call. Returns the affected provider ids.
 * Does nothing when the OS cannot decrypt at all (the keys may work once a keyring is back).
 */
export async function setAsideUndecryptableSecrets(): Promise<string[]> {
  return serialized(async () => {
    const map = await readMap()
    const ids = Object.keys(map)
    if (ids.length === 0 || !encryptionAvailable()) return []
    const failed = ids.filter((id) => !decrypts(map[id]!))
    if (failed.length === 0) return []
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const aside = userDataPath(`secrets.unreadable-${stamp}.json`)
    await writeFileAtomic(aside, JSON.stringify(map, null, 2) + '\n')
    await fs.chmod(aside, 0o600).catch(() => undefined)
    for (const id of failed) delete map[id]
    await writeMap(map)
    // Redaction keys are replaced on next use; only provider keys need re-entering.
    return failed.filter((id) => !id.startsWith(REDACTION_PREFIX))
  })
}

// ---- project redaction keys (#433) ------------------------------------------------------

/** Map entries for redaction keys; ':' never appears in a provider id, so they cannot clash. */
const REDACTION_PREFIX = 'redaction:'

/**
 * The project's redaction key: 32 random bytes, created on first use and kept with the API
 * keys (encrypted with safeStorage), never in the project folder. Returns undefined when the
 * OS cannot encrypt: the caller then uses a key that lasts for this app session only.
 */
export async function projectRedactionKey(projectId: string): Promise<Buffer | undefined> {
  if (!SafeId.safeParse(projectId).success)
    throw new AppError('VALIDATION', 'Invalid project id for the redaction key')
  if (!encryptionAvailable()) return undefined
  const entry = REDACTION_PREFIX + projectId
  return serialized(async () => {
    const map = await readMap()
    const cipher = map[entry]
    if (cipher !== undefined) {
      try {
        const key = Buffer.from(safeStorage.decryptString(Buffer.from(cipher, 'base64')), 'base64')
        if (key.length === 32) return key
      } catch {
        // Written under another keychain entry: replace it (only placeholder spellings change).
      }
    }
    const key = randomBytes(32)
    map[entry] = safeStorage.encryptString(key.toString('base64')).toString('base64')
    await writeMap(map)
    return key
  })
}

export async function hasSecret(providerId: string): Promise<boolean> {
  checkId(providerId)
  return providerId in (await readMap())
}

/** Tests only. */
export function resetSecretsQueue(): void {
  chain = Promise.resolve()
}
