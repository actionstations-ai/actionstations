/**
 * A running session's secrets, `userData/live/sessions/<id>.json` (spec 0406, docs/05): the staff
 * root per epoch and the controller signing key as a JWK, `safeStorage` ciphertext only, deleted
 * at `session.end`. They exist so an interrupted session can be resumed (spec 0417 FR-7) without
 * ever writing a key into the project folder. Resume itself lands with 0417.
 */
import { promises as fs } from 'node:fs'
import { safeStorage } from 'electron'
import { z } from 'zod'
import { SessionId } from '@shared/live/schemas/envelope'
import { AppError } from '../lib/errors'
import { writeFileAtomic } from '../lib/fs'
import { userDataPath } from '../lib/paths'

export const StoredSessionKeys = z.object({
  sessionId: SessionId,
  /** epoch → staff root, base64url. */
  staffRoots: z.record(z.string().regex(/^[1-9]\d{0,3}$/), z.string()),
  /** The controller's ECDSA private key (JWK) and its public key, base64url. */
  signing: z.object({ privateJwk: z.record(z.string(), z.unknown()), publicKey: z.string() }),
  /** The controller's ECDH private key (JWK): opens frames sealed to the controller. */
  ecdh: z.object({ privateJwk: z.record(z.string(), z.unknown()), publicKey: z.string() }),
  lastSeq: z.number().int().min(0),
})
export type StoredSessionKeys = z.infer<typeof StoredSessionKeys>

export const sessionKeysDir = (): string => userDataPath('live', 'sessions')

function pathFor(sessionId: string): string {
  if (!SessionId.safeParse(sessionId).success) throw new AppError('VALIDATION', 'Bad session id')
  return userDataPath('live', 'sessions', `${sessionId}.json`)
}

/** Whether the OS can encrypt for us; without it no key file is written (the session still runs). */
export function keyStorageAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  return !(
    process.platform === 'linux' && safeStorage.getSelectedStorageBackend?.() === 'basic_text'
  )
}

export async function writeSessionKeys(keys: StoredSessionKeys): Promise<boolean> {
  if (!keyStorageAvailable()) return false
  const path = pathFor(keys.sessionId)
  const cipher = safeStorage.encryptString(JSON.stringify(StoredSessionKeys.parse(keys)))
  await writeFileAtomic(path, cipher.toString('base64') + '\n')
  await fs.chmod(path, 0o600).catch(() => undefined)
  return true
}

export async function readSessionKeys(sessionId: string): Promise<StoredSessionKeys | undefined> {
  if (!keyStorageAvailable()) return undefined
  let raw: string
  try {
    raw = await fs.readFile(pathFor(sessionId), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw e
  }
  const text = safeStorage.decryptString(Buffer.from(raw.trim(), 'base64'))
  return StoredSessionKeys.parse(JSON.parse(text))
}

export async function deleteSessionKeys(sessionId: string): Promise<void> {
  await fs.rm(pathFor(sessionId), { force: true })
}
