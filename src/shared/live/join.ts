/**
 * Joining: what a device claims in `join` and what the controller can believe. A device's
 * `kind` is a claim; holding the staff key is proven by `staffProof`, which only a holder of the
 * current staff root can compute. The controller grants staff material (rotation roots,
 * assignments) only to proven staff.
 */
import { fromBase64Url, toBase64Url } from './bytes'
import type { Opened } from './codec'
import type { SessionKeys } from './crypto/keys'
import type { KeyPair } from './crypto/provider'
import { STAFF_KINDS, type ClientKind, type JoinPayload } from './schemas'

export interface JoinVerdict {
  /** The kind the device claimed. */
  kind: ClientKind
  /** Whether the kind is a staff kind (evaluator, SimCell). */
  claimedStaff: boolean
  /** Whether the device proved it holds the current staff root. */
  staff: boolean
  /** The client's ECDH public key, for rotations. */
  ecdhPub: Uint8Array
}

/** Device side: the `join` payload with a staff proof when this device holds the staff key. */
export async function buildJoin(
  keys: SessionKeys,
  clientId: string,
  ecdh: KeyPair,
  join: Omit<JoinPayload, 'ecdhPub' | 'staffProof'>,
): Promise<JoinPayload> {
  const payload: JoinPayload = { ...join, ecdhPub: toBase64Url(ecdh.publicKey) }
  if (STAFF_KINDS.has(join.kind)) {
    const proof = await keys.staffProof(clientId, ecdh.publicKey)
    if (proof) payload.staffProof = toBase64Url(proof)
  }
  return payload
}

/**
 * Controller side. A staff claim without a valid proof comes back with `staff: false` and
 * `claimedStaff: true`; the controller refuses that seat (`welcome.rejected: not_allowed`) or
 * seats the device as a player, and never counts it as staff in a rotation.
 */
export async function verifyJoin(keys: SessionKeys, msg: Opened<'join'>): Promise<JoinVerdict> {
  const { kind, ecdhPub, staffProof } = msg.payload
  const pub = fromBase64Url(ecdhPub)
  const claimedStaff = STAFF_KINDS.has(kind)
  const proof = staffProof === undefined ? undefined : fromBase64Url(staffProof)
  const staff = claimedStaff && (await keys.verifyStaffProof(msg.from, pub, proof))
  return { kind, claimedStaff, staff, ecdhPub: pub }
}
