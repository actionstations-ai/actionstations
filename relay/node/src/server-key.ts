/**
 * The server key (spec 0409 FR-3): the one credential the server has, required to create a
 * session. Only its SHA-256 is stored (`<data-dir>/server-key.hash`); the plaintext is printed
 * once at generation and once per `rotate-key`. The hash file is read on every check, so a
 * rotation takes effect at once without a restart.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { constantTimeEqual, hashBearerToken, randomToken } from '@actionstations/relay-core'

export const SERVER_KEY_FILE = 'server-key.hash'

export function serverKeyPath(dataDir: string): string {
  return join(dataDir, SERVER_KEY_FILE)
}

/** Writes a new key's hash and returns the key itself, to be shown once. */
export async function rotateServerKey(dataDir: string): Promise<string> {
  const key = randomToken()
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(serverKeyPath(dataDir), (await hashBearerToken(key)) + '\n', { mode: 0o600 })
  return key
}

/** The stored hash, or `undefined` before the first start. */
export function readServerKeyHash(dataDir: string): string | undefined {
  const path = serverKeyPath(dataDir)
  if (!existsSync(path)) return undefined
  const text = readFileSync(path, 'utf8').trim()
  return /^[a-f0-9]{64}$/.test(text) ? text : undefined
}

/** Whether a presented bearer token is the current server key (constant-time on the hashes). */
export async function isServerKey(
  dataDir: string,
  presented: string | undefined,
): Promise<boolean> {
  const stored = readServerKeyHash(dataDir)
  if (!stored || !presented) return false
  return constantTimeEqual(await hashBearerToken(presented), stored)
}
