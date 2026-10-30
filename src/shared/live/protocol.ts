/**
 * Live play protocol constants (spec 0406, ADR-0027). Shared by the clients (controller app,
 * player page) and the servers (LAN, relay, self-hosted), which import this file and the
 * schemas only: a server holds no key and never looks inside a payload.
 */

export const PROTOCOL_VERSION = 1

/** Layout byte that starts an invite fragment: which key the link carries. */
export const INVITE_LAYOUT = { players: 0x01, staff: 0x02 } as const

export type ConnectionKind = 'lan' | 'relay' | 'self-hosted'

export interface Limits {
  /** Largest envelope JSON a server accepts, in bytes. */
  envelopeBytes: number
  /**
   * Sealed bytes per `relay.blob.put` / `relay.blob.chunk` frame, before base64url. Chosen so
   * the frame (4/3 of this plus the header) stays under `envelopeBytes`: one size rule for
   * every frame.
   */
  chunkBytes: number
  /** Largest single blob (plaintext bytes) the controller may upload. */
  blobBytes: number
  /** Largest single blob a player (attachments, call answers) may upload. */
  playerBlobBytes: number
  /** Total blob bytes stored per session. */
  blobsTotalBytes: number
  /** Connected clients per session. */
  clients: number
}

const KiB = 1024
const MiB = 1024 * KiB

export const LIMITS: Record<ConnectionKind, Limits> = {
  lan: {
    envelopeBytes: 256 * KiB,
    chunkBytes: 180 * KiB,
    // Blobs live in the app's memory on the LAN (#457 review): 128 MiB a blob, 512 MiB a session.
    blobBytes: 128 * MiB,
    playerBlobBytes: 2 * MiB,
    blobsTotalBytes: 512 * MiB,
    clients: 60,
  },
  relay: {
    envelopeBytes: 64 * KiB,
    chunkBytes: 45 * KiB,
    blobBytes: 8 * MiB,
    playerBlobBytes: 1 * MiB,
    blobsTotalBytes: 64 * MiB,
    clients: 60,
  },
  'self-hosted': {
    envelopeBytes: 256 * KiB,
    chunkBytes: 180 * KiB,
    blobBytes: 64 * MiB,
    playerBlobBytes: 4 * MiB,
    blobsTotalBytes: 1024 * MiB,
    clients: 60,
  },
}

/** WebSocket close codes a server uses; the client library maps them to messages. */
export const CLOSE_CODES = {
  VERSION: 4000,
  BAD_JOIN_TOKEN: 4001,
  SESSION_ENDED: 4002,
  KICKED: 4003,
  SESSION_FULL: 4004,
  /** The client id is bound to another resume token (someone else connected with it first). */
  CLIENT_ID_IN_USE: 4005,
  RATE_LIMITED: 4008,
} as const

export const MESSAGE_TYPES = [
  'join',
  'welcome',
  'presence',
  'catchup.request',
  'catchup.batch',
  'clock.state',
  'inject.release',
  'inject.receipt',
  'inject.recall',
  'message.send',
  'vote.open',
  'vote.cast',
  'vote.close',
  'hotwash.item',
  'hotwash.update',
  'survey.open',
  'survey.response',
  'survey.close',
  'eval.assign',
  'eval.observation',
  'call.ring',
  'call.answer',
  'call.end',
  'controller.notice',
  'controller.roster',
  'partner.receipt',
  'simcell.draft',
  'simcell.action',
  'session.end',
  'session.rekey',
  'relay.hello',
  'relay.error',
  'relay.blob.put',
  'relay.blob.get',
  'relay.blob.chunk',
  'relay.blob.done',
] as const
export type MessageType = (typeof MESSAGE_TYPES)[number]

/** Payload is a plain object: the server must read it or the server wrote it. */
export const PLAINTEXT_TYPES: ReadonlySet<MessageType> = new Set<MessageType>([
  'presence',
  'catchup.request',
  'catchup.batch',
  'relay.hello',
  'relay.error',
  'relay.blob.put',
  'relay.blob.get',
  'relay.blob.chunk',
  'relay.blob.done',
])

/** Types that must carry a controller signature. `call.end` is signed when `by` is `controller`. */
export const SIGNED_TYPES: ReadonlySet<MessageType> = new Set<MessageType>([
  'welcome',
  'clock.state',
  'inject.release',
  'inject.recall',
  'vote.open',
  'vote.close',
  'hotwash.update',
  'survey.open',
  'survey.close',
  'eval.assign',
  'call.ring',
  'controller.notice',
  'controller.roster',
  'partner.receipt',
  'simcell.draft',
  'session.end',
  'session.rekey',
])

/** Signed types only the host key may sign; a co-controller's signature is `OUT_OF_SCOPE`. */
export const HOST_ONLY_TYPES: ReadonlySet<MessageType> = new Set<MessageType>([
  'welcome',
  'clock.state',
  'eval.assign',
  'controller.roster',
  'partner.receipt',
  'simcell.draft',
  'session.end',
  'session.rekey',
])

/** Types a server accepts only from a controller connection (it cannot verify signatures). */
export const CONTROLLER_ONLY_TYPES: ReadonlySet<MessageType> = new Set<MessageType>([
  ...SIGNED_TYPES,
])

/**
 * Types a server accepts only from a device connection (a participant), never from a controller
 * connection: they travel from a staff device to the controller, so a controller connection
 * sending one is a confused or hostile client.
 */
export const PARTICIPANT_ONLY_TYPES: ReadonlySet<MessageType> = new Set<MessageType>([
  'simcell.action',
])

/** Types that are only ever addressed to one device (`client:<id>`), never to a role or everyone. */
export const CLIENT_ADDRESSED_TYPES: ReadonlySet<MessageType> = new Set<MessageType>([
  'partner.receipt',
  'simcell.draft',
])

/** Never stored for catch-up. */
export const EPHEMERAL_TYPES: ReadonlySet<MessageType> = new Set<MessageType>([
  'presence',
  'catchup.request',
  'catchup.batch',
  'relay.hello',
  'relay.error',
  'relay.blob.put',
  'relay.blob.get',
  'relay.blob.chunk',
  'relay.blob.done',
])

/**
 * Which key seals a type. `players`: every client must read it. `staff`: controllers,
 * evaluators and SimCell only; a player's device never holds this key. `controller`: sealed to
 * the controller alone with a per-message ECDH key (every frame whose `to` is `controller`),
 * so no other device, whatever key it holds, can read it. `either`: the sender chooses by
 * destination and content (an `inject.release` with `expectedAction` must use `staff`; a frame
 * to `controller` is always `controller`).
 */
export type KeyKind = 'players' | 'staff'
export type SealKind = KeyKind | 'controller'
export type KeyRule = SealKind | 'either'

export const KEY_BY_TYPE: Record<Exclude<MessageType, PlaintextType>, KeyRule> = {
  join: 'controller',
  welcome: 'players',
  'clock.state': 'players',
  'inject.release': 'either',
  'inject.receipt': 'controller',
  'inject.recall': 'players',
  'message.send': 'either',
  'vote.open': 'players',
  'vote.cast': 'controller',
  'vote.close': 'players',
  'hotwash.item': 'controller',
  'hotwash.update': 'players',
  'survey.open': 'players',
  'survey.response': 'controller',
  'survey.close': 'players',
  'eval.assign': 'staff',
  'eval.observation': 'controller',
  'call.ring': 'players',
  'call.answer': 'controller',
  'call.end': 'either',
  'controller.notice': 'either',
  'controller.roster': 'players',
  'partner.receipt': 'staff',
  'simcell.draft': 'staff',
  'simcell.action': 'controller',
  'session.end': 'players',
  'session.rekey': 'players',
}

export type PlaintextType =
  | 'presence'
  | 'catchup.request'
  | 'catchup.batch'
  | 'relay.hello'
  | 'relay.error'
  | 'relay.blob.put'
  | 'relay.blob.get'
  | 'relay.blob.chunk'
  | 'relay.blob.done'
export type SealedType = Exclude<MessageType, PlaintextType>

/** Why a frame was dropped. `NOT_FOR_ME`, `STAFF_ONLY` and `CONTROLLER_ONLY` are expected and not errors. */
export const DROP_REASONS = [
  'SIZE',
  'PARSE',
  'REPLAY',
  'BAD_TAG',
  'UNSIGNED_CONTROLLER_MESSAGE',
  'BAD_SIG',
  'OUT_OF_SCOPE',
  'UNKNOWN_EPOCH',
  'STAFF_ONLY',
  'CONTROLLER_ONLY',
  'WRONG_KEY',
  'NOT_FOR_ME',
] as const
export type DropReason = (typeof DROP_REASONS)[number]

/** HKDF labels. Every derived key has its own label so no two uses share bytes. */
export const HKDF_INFO = {
  /** players root from the staff root: players cannot go the other way. */
  players: (sessionId: string) => `as-live/v1/players/${sessionId}`,
  enc: (key: KeyKind, sessionId: string) => `as-live/v1/enc/${key}/${sessionId}`,
  join: (sessionId: string) => `as-live/v1/join/${sessionId}`,
  kek: (clientId: string, epoch: number) => `as-live/v1/kek/${clientId}/${epoch}`,
  blob: (blobId: string) => `as-live/v1/blob/${blobId}`,
  /** Per-message key for frames sealed to the controller (ECDH with the key in the invite, salted with the epoch's players key). */
  toController: (sessionId: string) => `as-live/v1/to-controller/${sessionId}`,
  /** A staff device's proof in `join` that it holds the current staff root. */
  staffProof: (sessionId: string, clientId: string, ecdhPub: string) =>
    `as-live/v1/staff-proof/${sessionId}/${clientId}/${ecdhPub}`,
} as const

/** Bytes of a join token (presented on connect; the server stores only its SHA-256). */
export const JOIN_TOKEN_BYTES = 16
/** Bytes of the resume token that binds a client id to the device that first used it. */
export const RESUME_TOKEN_BYTES = 16
export const STAFF_PROOF_BYTES = 32
/** Highest `yourLastSeq` a client accepts from a server's hello; larger values are ignored. */
export const MAX_SEQ_HINT = 2 ** 48
export const SESSION_KEY_BYTES = 32
export const NONCE_BYTES = 12
export const EC_PUBLIC_KEY_BYTES = 65
export const SIGNATURE_BYTES = 64
export const MAX_EPOCH = 9999
/**
 * After a rotation the controller still opens frames sealed to it under the previous epoch's
 * players key for this long, so a device mid-reconnect is not cut off; after it, a kicked
 * device's frames under the old epoch are dropped (#457 review).
 */
export const REKEY_GRACE_MS = 60_000
