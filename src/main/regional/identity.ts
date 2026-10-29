// Organization identities on this computer (spec 0440 FR-2). The private keys are encrypted
// with the OS keychain (safeStorage) through the secrets store, under `org-key-<orgId>`; the
// public key, fingerprint and live key are kept in settings.json. A key is never exported.
import { z } from 'zod'
import { OrgPrefix, orgIdForPrefix } from '@shared/schemas/regional'
import type { RegionalIdentity } from '@shared/schemas/settings'
import { AppError } from '../lib/errors'
import { getSecret, setSecret } from '../secrets'
import { getSettings, updateSettings } from '../settings/store'
import { fingerprintOf, generateBundleKeys, generateLiveKeys } from './keys'

const StoredKeys = z.object({ bundle: z.string(), live: z.string() })

const secretId = (orgId: string): string => `org-key-${orgId}`

export async function listIdentities(): Promise<RegionalIdentity[]> {
  const settings = await getSettings()
  return Object.values(settings.regional.orgs).sort((a, b) => a.name.localeCompare(b.name))
}

export async function createIdentity(input: {
  name: string
  prefix: string
}): Promise<RegionalIdentity> {
  const name = input.name.trim()
  if (!name) throw new AppError('VALIDATION', 'Enter the organization’s name.')
  if (!OrgPrefix.safeParse(input.prefix).success)
    throw new AppError('VALIDATION', 'The short prefix is 2 to 6 capital letters, for example AIR.')
  const orgId = orgIdForPrefix(input.prefix)
  if ((await getSettings()).regional.orgs[orgId])
    throw new AppError(
      'CONFLICT',
      `An identity for ${input.prefix} already exists on this computer.`,
    )
  const bundle = generateBundleKeys()
  const live = generateLiveKeys()
  // Refuses (FORBIDDEN) when the OS cannot encrypt, before anything is recorded.
  await setSecret(
    secretId(orgId),
    JSON.stringify({ bundle: bundle.privateKey, live: live.privateKey }),
  )
  const identity: RegionalIdentity = {
    orgId,
    name,
    prefix: input.prefix,
    publicKey: bundle.publicKey,
    fingerprint: fingerprintOf(bundle.publicKey),
    liveKey: live.publicKey,
    createdAt: new Date().toISOString(),
  }
  await updateSettings((s) => {
    s.regional.orgs[orgId] = identity
  })
  return identity
}

export async function requireIdentity(orgId: string): Promise<RegionalIdentity> {
  const found = (await getSettings()).regional.orgs[orgId]
  if (!found)
    throw new AppError(
      'NOT_FOUND',
      `This computer has no identity for ${orgId.toUpperCase()}. Create it first.`,
    )
  return found
}

/** The bundle signing key pair of an identity, for the writer. */
export async function loadSigner(
  orgId: string,
): Promise<{ privateKey: string; publicKey: string }> {
  const identity = await requireIdentity(orgId)
  const raw = await getSecret(secretId(orgId))
  if (!raw) throw new AppError('NOT_FOUND', 'The signing key for this organization is missing.')
  const keys = StoredKeys.parse(JSON.parse(raw))
  return { privateKey: keys.bundle, publicKey: identity.publicKey }
}
