/**
 * Test setup shared by the protocol tests: a controller with its keys and signing key, and
 * the keys a player or a staff member derives from their invite link.
 */
import { createWebCryptoProvider } from '../crypto/webcrypto'
import { SessionKeys } from '../crypto/keys'
import type { CryptoProvider, KeyPair } from '../crypto/provider'
import { buildInvite, parseInvite } from '../invite'
import type { KeyKind } from '../protocol'
import { IDS } from './payloads'

export interface Controller {
  crypto: CryptoProvider
  sessionId: string
  keys: SessionKeys
  signing: KeyPair
  controllerPub: Uint8Array
  invite: (kind: KeyKind, roleHint?: string) => string
}

export async function makeController(crypto = createWebCryptoProvider()): Promise<Controller> {
  const sessionId = IDS.session
  const keys = await SessionKeys.create(crypto, sessionId)
  const signing = await crypto.ecdsaGenerate()
  return {
    crypto,
    sessionId,
    keys,
    signing,
    controllerPub: signing.publicKey,
    invite: (kind, roleHint) =>
      buildInvite({
        base: 'https://relay.example',
        sessionId,
        epoch: keys.currentEpoch,
        key: { kind, root: keys.root(kind)! },
        controllerPub: signing.publicKey,
        controllerEcdhPub: keys.controllerEcdhPub!,
        ...(roleHint ? { roleHint } : {}),
      }),
  }
}

/** The keys a device derives from scanning a link of the given kind. */
export async function keysFromInvite(
  ctl: Controller,
  kind: KeyKind,
  crypto: CryptoProvider = ctl.crypto,
): Promise<SessionKeys> {
  const invite = parseInvite(ctl.invite(kind))
  const keys = new SessionKeys(invite.sessionId, crypto, {
    controllerEcdhPub: invite.controllerEcdhPub,
  })
  await keys.addEpoch(invite.epoch, invite.key.kind, invite.key.root)
  return keys
}
