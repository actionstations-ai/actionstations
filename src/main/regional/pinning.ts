// Per-exercise key pinning (spec 0440 FR-4). No certificates: the first bundle from an
// organization is trusted only after a person compares its fingerprint with one received by
// another channel (phone, in person). A later bundle signed by a different key is refused until
// the user states they verified the new fingerprint.
import type { RegionalOrg, RegionalState } from '@shared/schemas/regional'
import { AppError } from '../lib/errors'
import { fingerprintOf, sameFingerprint } from './keys'

export interface Signer {
  orgId: string
  prefix: string
  publicKey: string
}

export type PinStatus = 'pinned' | 'new' | 'changed' | 'unknown_org'

/** How a bundle's signer relates to the key pinned for the organization it claims to be from. */
export function pinStatus(state: Pick<RegionalState, 'orgs'>, signer: Signer): PinStatus {
  const org = state.orgs.find((o) => o.orgId === signer.orgId && o.prefix === signer.prefix)
  if (!org) return 'unknown_org'
  if (!org.publicKey) return 'new'
  return org.publicKey === signer.publicKey ? 'pinned' : 'changed'
}

export interface PinRequest {
  orgId: string
  prefix: string
  publicKey: string
  liveKey?: string
  /** What the user typed or read from the other channel. */
  confirmFingerprint: string
  /** Replace a different pinned key ("Key changed - I verified the new fingerprint"). */
  replace?: boolean
}

/** Pin a key after the user confirmed its fingerprint. Returns the updated orgs. */
export function pinKey(
  state: Pick<RegionalState, 'orgs'>,
  req: PinRequest,
  now = new Date().toISOString(),
): RegionalOrg[] {
  const status = pinStatus(state, req)
  if (status === 'unknown_org')
    throw new AppError('VALIDATION', 'This organization is not part of the exercise.')
  if (status === 'pinned') return state.orgs
  if (status === 'changed' && !req.replace)
    throw new AppError(
      'CONFLICT',
      'This organization signed with a different key than the one pinned. Do not trust it until you have verified the new fingerprint with them.',
      { reason: 'key_changed' },
    )
  const fingerprint = fingerprintOf(req.publicKey)
  if (!sameFingerprint(req.confirmFingerprint, fingerprint))
    throw new AppError(
      'VALIDATION',
      'The fingerprint you entered does not match this bundle. Check it again with the sender.',
      { reason: 'fingerprint_mismatch' },
    )
  return state.orgs.map((o) =>
    o.orgId === req.orgId
      ? {
          ...o,
          publicKey: req.publicKey,
          fingerprint,
          ...(req.liveKey ? { liveKey: req.liveKey } : {}),
          pinnedAt: now,
        }
      : o,
  )
}

/** A bundle from a pinned key may refresh the organization's live key; other fields never change. */
export function withLiveKey(
  orgs: RegionalOrg[],
  orgId: string,
  liveKey: string | undefined,
): RegionalOrg[] {
  if (!liveKey) return orgs
  return orgs.map((o) => (o.orgId === orgId ? { ...o, liveKey } : o))
}
