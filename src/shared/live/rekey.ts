/**
 * Key rotation (kick a client, replace a leaked link). The controller makes a new staff root
 * for epoch + 1 and wraps, for every client it keeps, the root that client is entitled to:
 * the staff root for devices that proved they hold the staff key (`join.staffProof`, checked
 * with `verifyJoin`), the players root for everyone else. The wrap key is a pairwise ECDH
 * secret from a fresh controller key and the client's `join.ecdhPub`.
 */
import { fromBase64Url, toBase64Url, utf8 } from './bytes'
import type { SessionKeys } from './crypto/keys'
import type { CryptoProvider, KeyPair } from './crypto/provider'
import { HKDF_INFO, NONCE_BYTES, SESSION_KEY_BYTES, type KeyKind } from './protocol'
import { STAFF_KINDS, type ClientId, type ClientKind, type SessionRekeyPayload } from './schemas'

export interface RekeyClient {
  clientId: ClientId
  /** From the client's `join`, 65 bytes. */
  ecdhPub: Uint8Array
  /** Proven with `join.staffProof` (`verifyJoin`), never the self-declared `join.kind`. */
  staff: boolean
}

export interface RekeyMessage {
  to: `client:${string}`
  payload: SessionRekeyPayload
}

export interface Rotation {
  epoch: number
  messages: RekeyMessage[]
  kicked: ClientId[]
}

function wrapAad(clientId: string, epoch: number): Uint8Array {
  return utf8(`as-live/v1/rekey/${clientId}/${epoch}`)
}

async function kekFor(
  crypto: CryptoProvider,
  shared: Uint8Array,
  clientId: string,
  epoch: number,
): Promise<Uint8Array> {
  return crypto.hkdf(shared, HKDF_INFO.kek(clientId, epoch), 32)
}

/** Which key a kind of device is entitled to, once its claim is proven. */
export function keyKindFor(kind: ClientKind): KeyKind {
  return STAFF_KINDS.has(kind) ? 'staff' : 'players'
}

/**
 * Controller side. Adds the new epoch to `keys` (so the controller seals under it from now on)
 * and returns one `session.rekey` payload per kept client, to be sealed under the previous
 * epoch's players key and sent to `client:<id>`.
 */
export async function rotate(
  crypto: CryptoProvider,
  keys: SessionKeys,
  clients: readonly RekeyClient[],
  kicked: readonly ClientId[] = [],
): Promise<Rotation> {
  const epoch = keys.currentEpoch + 1
  const staffRoot = crypto.random(SESSION_KEY_BYTES)
  const next = await keys.addEpoch(epoch, 'staff', staffRoot)
  const ephemeral = await crypto.ecdhGenerate()
  const controllerEcdhPub = toBase64Url(ephemeral.publicKey)
  const kickedSet = new Set(kicked)
  const messages: RekeyMessage[] = []
  for (const client of clients) {
    if (kickedSet.has(client.clientId)) continue
    const kind: KeyKind = client.staff ? 'staff' : 'players'
    const root = kind === 'staff' ? next.staffRoot! : next.playersRoot
    const shared = await crypto.ecdhDerive(ephemeral.privateKey, client.ecdhPub)
    const kek = await kekFor(crypto, shared, client.clientId, epoch)
    const nonce = crypto.random(NONCE_BYTES)
    const sealed = await crypto.aesGcmSeal(kek, nonce, wrapAad(client.clientId, epoch), root)
    messages.push({
      to: `client:${client.clientId}`,
      payload: {
        epoch,
        key: kind,
        controllerEcdhPub,
        wrapped: { n: toBase64Url(nonce), c: toBase64Url(sealed) },
      },
    })
  }
  return { epoch, messages, kicked: [...kickedSet] }
}

/** Client side: unwrap the root meant for this client and add the epoch to `keys`. */
export async function applyRekey(
  crypto: CryptoProvider,
  keys: SessionKeys,
  clientId: ClientId,
  ecdh: KeyPair,
  payload: SessionRekeyPayload,
): Promise<number> {
  if (payload.epoch <= keys.currentEpoch) throw new Error('Rekey to an epoch already known')
  const shared = await crypto.ecdhDerive(ecdh.privateKey, fromBase64Url(payload.controllerEcdhPub))
  const kek = await kekFor(crypto, shared, clientId, payload.epoch)
  const root = await crypto.aesGcmOpen(
    kek,
    fromBase64Url(payload.wrapped.n),
    wrapAad(clientId, payload.epoch),
    fromBase64Url(payload.wrapped.c),
  )
  await keys.addEpoch(payload.epoch, payload.key, root)
  return payload.epoch
}
