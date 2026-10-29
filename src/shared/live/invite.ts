/**
 * Invite link and QR text: `<base>/s/<sessionId>#<fragment>[.<roleHint>]`.
 *
 *   fragment = base64url( layout:u8 ‖ epoch:u16be ‖ root:32 ‖ controllerSigPub:65 ‖ controllerEcdhPub:65 )
 *   layout   = 0x01 players link (players root) | 0x02 staff link (staff root)
 *
 * The fragment never reaches a server: browsers do not send it, and the page reads
 * `location.hash` once. A staff link derives the players key; a players link cannot derive the
 * staff key. The controller's ECDH public key is what every device seals its frames to the
 * controller with, so no other device can read them.
 */
import { concatBytes, fromBase64Url, toBase64Url } from './bytes'
import {
  EC_PUBLIC_KEY_BYTES,
  INVITE_LAYOUT,
  MAX_EPOCH,
  SESSION_KEY_BYTES,
  type KeyKind,
} from './protocol'
import { SessionId } from './schemas/envelope'

export const ROLE_HINT_KEYWORDS = ['evaluator', 'observer', 'simcell'] as const
const ROLE_HINT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const FRAGMENT_BYTES = 1 + 2 + SESSION_KEY_BYTES + 2 * EC_PUBLIC_KEY_BYTES
const NOT_COMPLETE = 'This link is not complete. Ask for a new one.'

export interface Invite {
  base: string
  sessionId: string
  epoch: number
  key: { kind: KeyKind; root: Uint8Array }
  /** Controller ECDSA public key: verifies controller signatures. */
  controllerPub: Uint8Array
  /** Controller ECDH public key: frames to the controller are sealed to it. */
  controllerEcdhPub: Uint8Array
  roleHint?: string
}

export type InviteErrorCode = 'MALFORMED' | 'UNKNOWN_LAYOUT'

export class InviteError extends Error {
  constructor(
    readonly code: InviteErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'InviteError'
  }
}

function assertPoint(bytes: Uint8Array, what: string): void {
  if (bytes.length !== EC_PUBLIC_KEY_BYTES || bytes[0] !== 0x04) {
    throw new Error(`${what} must be an uncompressed P-256 point`)
  }
}

export function buildInviteFragment(invite: Omit<Invite, 'base' | 'sessionId'>): string {
  if (!Number.isInteger(invite.epoch) || invite.epoch < 1 || invite.epoch > MAX_EPOCH) {
    throw new Error('Bad epoch')
  }
  if (invite.key.root.length !== SESSION_KEY_BYTES) throw new Error('Root key must be 32 bytes')
  assertPoint(invite.controllerPub, 'Controller public key')
  assertPoint(invite.controllerEcdhPub, 'Controller ECDH public key')
  if (invite.roleHint !== undefined && !ROLE_HINT.test(invite.roleHint)) {
    throw new Error('Bad role hint')
  }
  const head = new Uint8Array([
    INVITE_LAYOUT[invite.key.kind],
    (invite.epoch >> 8) & 0xff,
    invite.epoch & 0xff,
  ])
  const fragment = toBase64Url(
    concatBytes(head, invite.key.root, invite.controllerPub, invite.controllerEcdhPub),
  )
  return invite.roleHint ? `${fragment}.${invite.roleHint}` : fragment
}

export function buildInvite(invite: Invite): string {
  if (!SessionId.safeParse(invite.sessionId).success) throw new Error('Bad session id')
  const base = invite.base.replace(/\/+$/, '')
  return `${base}/s/${invite.sessionId}#${buildInviteFragment(invite)}`
}

function layoutKind(layout: number | undefined): KeyKind {
  if (layout === INVITE_LAYOUT.players) return 'players'
  if (layout === INVITE_LAYOUT.staff) return 'staff'
  throw new InviteError(
    'UNKNOWN_LAYOUT',
    'This link was made by a newer version. Ask the facilitator for a new link.',
  )
}

export function parseInviteFragment(fragment: string): Omit<Invite, 'base' | 'sessionId'> {
  const text = fragment.startsWith('#') ? fragment.slice(1) : fragment
  const dot = text.indexOf('.')
  const encoded = dot === -1 ? text : text.slice(0, dot)
  const roleHint = dot === -1 ? undefined : text.slice(dot + 1)
  if (roleHint !== undefined && !ROLE_HINT.test(roleHint)) {
    throw new InviteError('MALFORMED', NOT_COMPLETE)
  }
  let bytes: Uint8Array
  try {
    bytes = fromBase64Url(encoded)
  } catch {
    throw new InviteError('MALFORMED', NOT_COMPLETE)
  }
  const kind = layoutKind(bytes[0])
  if (bytes.length !== FRAGMENT_BYTES) throw new InviteError('MALFORMED', NOT_COMPLETE)
  const epoch = (bytes[1]! << 8) | bytes[2]!
  if (epoch < 1 || epoch > MAX_EPOCH) throw new InviteError('MALFORMED', NOT_COMPLETE)
  let o = 3
  const root = bytes.slice(o, (o += SESSION_KEY_BYTES))
  const controllerPub = bytes.slice(o, (o += EC_PUBLIC_KEY_BYTES))
  const controllerEcdhPub = bytes.slice(o, o + EC_PUBLIC_KEY_BYTES)
  if (controllerPub[0] !== 0x04 || controllerEcdhPub[0] !== 0x04) {
    throw new InviteError('MALFORMED', NOT_COMPLETE)
  }
  const invite = { epoch, key: { kind, root }, controllerPub, controllerEcdhPub }
  return roleHint === undefined ? invite : { ...invite, roleHint }
}

export function parseInvite(url: string): Invite {
  const hash = url.indexOf('#')
  if (hash === -1) throw new InviteError('MALFORMED', 'This link has no key. Ask for a new one.')
  const path = url.slice(0, hash)
  const m = /^(.*)\/s\/([A-Za-z0-9_-]{22})$/.exec(path)
  if (!m) throw new InviteError('MALFORMED', 'This link is not a session link.')
  return { base: m[1]!, sessionId: m[2]!, ...parseInviteFragment(url.slice(hash + 1)) }
}

/** The part of the invite that may be shown, logged or sent anywhere: no fragment. */
export function publicJoinUrl(base: string, sessionId: string): string {
  return `${base.replace(/\/+$/, '')}/s/${sessionId}`
}
