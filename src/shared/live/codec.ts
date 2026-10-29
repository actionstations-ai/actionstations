/**
 * Seal and open envelopes. AES-256-GCM over the JSON payload with the header as AAD; ECDSA
 * P-256 over header and ciphertext for controller types. Three kinds of key: the players and
 * staff session keys, and a per-message ECDH key for every frame sent to the controller, which
 * only the controller can open. `open()` is the one path every received frame takes, live or
 * from catch-up, so a tampered stored frame fails like a live one.
 */
import { byteLength, fromBase64Url, fromUtf8, toBase64Url, utf8 } from './bytes'
import type { CryptoProvider, PrivateKey } from './crypto/provider'
import type { SessionKeys } from './crypto/keys'
import {
  HKDF_INFO,
  HOST_ONLY_TYPES,
  KEY_BY_TYPE,
  NONCE_BYTES,
  PLAINTEXT_TYPES,
  REKEY_GRACE_MS,
  SIGNED_TYPES,
  type DropReason,
  type Limits,
  type MessageType,
  type PlaintextType,
  type SealKind,
  type SealedType,
} from './protocol'
import type { ReplayGuard } from './replay'
import {
  CONTROLLER_KEY_NAME,
  Ciphertext,
  Envelope,
  PAYLOAD_SCHEMAS,
  type ClientId,
  type ControllerRosterPayload,
  type ControllerScope,
  type Destination,
  type EnvelopeHeader,
  type PayloadByType,
  type PayloadInputByType,
} from './schemas'

export interface Opened<T extends MessageType = MessageType> {
  type: T
  from: ClientId
  to: Destination
  seq: number
  ts: number
  /** Server arrival index, when the frame came from `catchup.batch`. */
  index?: number
  payload: PayloadByType[T]
  /** Which key opened it; absent for plaintext types. */
  key?: SealKind
  /** `host` or a co-controller's organization id; set only when a signature verified. */
  signedBy?: string
}

export type OpenResult<T extends MessageType = MessageType> =
  | { ok: true; msg: Opened<T> }
  | { ok: false; reason: DropReason; detail?: string; envelope?: Envelope }

export interface SealOptions {
  /**
   * Which key seals it. Required for `either` types unless the destination decides (`controller`
   * → the controller key, `role:evaluators` → staff); a key the type's rule forbids is an error.
   */
  key?: SealKind
  /** Sign with the controller key. Signed types are always signed when a signer is given. */
  signer?: PrivateKey
  sign?: boolean
  epoch?: number
}

/**
 * Who opened a vote, survey or call (`id → signer`), so a co-controller may close only what it
 * opened (#440). Kept by the receiver across frames; `LiveClient` holds one.
 */
export class ScopeState {
  readonly openers = new Map<string, string>()

  record(type: MessageType, payload: unknown, signer: string): void {
    const id = scopedId(type, payload)
    if (id && (type === 'vote.open' || type === 'survey.open' || type === 'call.ring')) {
      this.openers.set(id, signer)
    }
  }

  openerOf(type: MessageType, payload: unknown): string | undefined {
    const id = scopedId(type, payload)
    return id === undefined ? undefined : this.openers.get(id)
  }
}

function scopedId(type: MessageType, payload: unknown): string | undefined {
  const p = payload as { voteId?: string; surveyId?: string; callId?: string }
  if (type.startsWith('vote.')) return p.voteId
  if (type.startsWith('survey.')) return p.surveyId
  if (type.startsWith('call.')) return p.callId
  return undefined
}

export interface OpenContext {
  crypto: CryptoProvider
  keys: SessionKeys
  /** The host controller's public key from the invite. */
  controllerPub: Uint8Array
  /** Co-controllers (#440); their signatures are accepted inside their scope. */
  roster?: ControllerRosterPayload
  /** Who opened which vote, survey or call, for co-controller close checks. */
  scope?: ScopeState
  replay?: ReplayGuard
  /** Frame size cap of the connection; frames over it are dropped before parsing. */
  limits?: Limits
  /** Server arrival index to attach (catch-up). */
  index?: number
  /** Wall clock for the rekey grace period; tests inject it. */
  now?: () => number
}

export class SealError extends Error {
  constructor(
    readonly code: 'KEY_RULE' | 'SCHEMA' | 'NO_SIGNER' | 'NO_CONTROLLER_KEY',
    message: string,
  ) {
    super(message)
    this.name = 'SealError'
  }
}

/** Deterministic AAD: fixed order, primitives only. */
export function aadFor(h: EnvelopeHeader): string {
  return JSON.stringify([h.v, h.session, h.seq, h.from, h.to, h.type, h.ts])
}

export function signingInput(aad: string, c: Ciphertext): Uint8Array {
  return utf8(`${aad}.${c.k}.${c.n}.${c.c}${c.e === undefined ? '' : `.${c.e}`}`)
}

export function isPlaintextType(type: MessageType): type is PlaintextType {
  return PLAINTEXT_TYPES.has(type)
}

function hasStaffFields(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as { expectedAction?: unknown }).expectedAction !== undefined
  )
}

/**
 * The keys a frame of this type, content and destination may travel under. Anything sent to
 * the controller is sealed to the controller alone; a `controller`-only type sent elsewhere has
 * no valid key. `payload` may be undefined before decryption (content rules are rechecked after).
 */
export function allowedKeys(type: SealedType, payload: unknown, to: Destination): Set<SealKind> {
  if (to === 'controller') return new Set<SealKind>(['controller'])
  const rule = KEY_BY_TYPE[type]
  if (rule === 'controller') return new Set()
  if (type === 'inject.release' && hasStaffFields(payload)) return new Set<SealKind>(['staff'])
  if (rule === 'either') return new Set<SealKind>(['players', 'staff'])
  return new Set<SealKind>([rule])
}

function resolveKey(
  type: SealedType,
  payload: unknown,
  to: Destination,
  explicit: SealKind | undefined,
): SealKind {
  const allowed = allowedKeys(type, payload, to)
  if (allowed.size === 0) {
    throw new SealError('KEY_RULE', `${type} is only ever sent to the controller`)
  }
  if (explicit !== undefined) {
    if (!allowed.has(explicit)) {
      throw new SealError('KEY_RULE', `${type} to ${to} cannot use the ${explicit} key`)
    }
    return explicit
  }
  if (allowed.size === 1) return [...allowed][0]!
  if (to === 'role:evaluators') return 'staff'
  throw new SealError('KEY_RULE', `${type} to ${to}: say which key seals it (players or staff)`)
}

function needsSignature(type: MessageType, payload: unknown): boolean {
  if (SIGNED_TYPES.has(type)) return true
  return type === 'call.end' && (payload as { by?: string }).by === 'controller'
}

/** A plaintext frame (server frames, catch-up, blob transport). */
export function sealPlain<T extends PlaintextType>(
  header: EnvelopeHeader & { type: T },
  payload: PayloadInputByType[T],
): Envelope {
  const parsed = PAYLOAD_SCHEMAS[header.type].safeParse(payload)
  if (!parsed.success) throw new SealError('SCHEMA', parsed.error.message)
  return { ...header, payload: parsed.data as Record<string, unknown> }
}

/**
 * Per-message key for a frame sealed to the controller: ECDH with the key from the invite, then
 * HKDF with that epoch's players key as the salt. The salt binds the frame to the session's key
 * material, so holding the controller's public key alone (a leaked link's visible part, a captured
 * page) is not enough to seal a frame the controller accepts (#452).
 */
async function controllerKey(
  crypto: CryptoProvider,
  keys: SessionKeys,
  ephemeralPriv: PrivateKey,
  peerPub: Uint8Array,
  playersEnc: Uint8Array,
): Promise<Uint8Array> {
  const shared = await crypto.ecdhDerive(ephemeralPriv, peerPub)
  return crypto.hkdf(shared, HKDF_INFO.toController(keys.sessionId), 32, playersEnc)
}

async function sealingMaterial(
  crypto: CryptoProvider,
  keys: SessionKeys,
  kind: SealKind,
  epoch: number | undefined,
): Promise<{ name: string; key: Uint8Array; e?: string }> {
  if (kind !== 'controller') return keys.sealingKey(kind, epoch)
  if (!keys.controllerEcdhPub) {
    throw new SealError('NO_CONTROLLER_KEY', 'No controller key to seal to (invite incomplete)')
  }
  const players = keys.epoch(epoch ?? keys.currentEpoch)
  if (!players)
    throw new SealError('NO_CONTROLLER_KEY', `Unknown epoch ${epoch ?? keys.currentEpoch}`)
  const ephemeral = await crypto.ecdhGenerate()
  const key = await controllerKey(
    crypto,
    keys,
    ephemeral.privateKey,
    keys.controllerEcdhPub,
    players.playersEnc,
  )
  return { name: CONTROLLER_KEY_NAME, key, e: toBase64Url(ephemeral.publicKey) }
}

export async function seal<T extends SealedType>(
  crypto: CryptoProvider,
  keys: SessionKeys,
  header: EnvelopeHeader & { type: T },
  payload: PayloadInputByType[T],
  opts: SealOptions = {},
): Promise<Envelope> {
  const parsed = PAYLOAD_SCHEMAS[header.type].safeParse(payload)
  if (!parsed.success) throw new SealError('SCHEMA', parsed.error.message)
  const kind = resolveKey(header.type, parsed.data, header.to, opts.key)
  const material = await sealingMaterial(crypto, keys, kind, opts.epoch)
  const nonce = crypto.random(NONCE_BYTES)
  const aad = aadFor(header)
  const sealed = await crypto.aesGcmSeal(
    material.key,
    nonce,
    utf8(aad),
    utf8(JSON.stringify(parsed.data)),
  )
  const ciphertext: Ciphertext = { k: material.name, n: toBase64Url(nonce), c: toBase64Url(sealed) }
  if (material.e !== undefined) ciphertext.e = material.e
  const envelope: Envelope = { ...header, payload: ciphertext }
  const mustSign = needsSignature(header.type, parsed.data)
  if (mustSign && !opts.signer) {
    throw new SealError('NO_SIGNER', `${header.type} must be signed by the controller`)
  }
  if (opts.signer && (mustSign || opts.sign)) {
    envelope.sig = toBase64Url(await crypto.ecdsaSign(opts.signer, signingInput(aad, ciphertext)))
  }
  return envelope
}

/** Header, key name, nonce, signature and JSON punctuation: what a sealed frame adds on top of the ciphertext. */
const FRAME_OVERHEAD_BYTES = 500

/**
 * Upper estimate of the sealed frame size for a payload, in bytes: base64url of the JSON plus
 * the GCM tag, plus the header. Senders that must fit a cap (an `eval.assign` on the relay)
 * trim until this is under `limits.envelopeBytes`.
 */
export function estimateFrameBytes(payload: unknown): number {
  return Math.ceil(((byteLength(JSON.stringify(payload)) + 16) * 4) / 3) + FRAME_OVERHEAD_BYTES
}

export function encodeFrame(envelope: Envelope): string {
  return JSON.stringify(envelope)
}

/** Parse a frame without opening it: what a server does. */
export function parseFrame(
  frame: string | unknown,
  limits?: Limits,
): { ok: true; envelope: Envelope } | { ok: false; reason: 'SIZE' | 'PARSE'; detail?: string } {
  let raw: unknown = frame
  if (typeof frame === 'string') {
    if (limits && byteLength(frame) > limits.envelopeBytes) return { ok: false, reason: 'SIZE' }
    try {
      raw = JSON.parse(frame)
    } catch {
      return { ok: false, reason: 'PARSE', detail: 'not JSON' }
    }
  }
  const parsed = Envelope.safeParse(raw)
  if (!parsed.success) return { ok: false, reason: 'PARSE', detail: parsed.error.message }
  return { ok: true, envelope: parsed.data }
}

function header(e: Envelope): EnvelopeHeader {
  return { v: e.v, session: e.session, seq: e.seq, from: e.from, to: e.to, type: e.type, ts: e.ts }
}

type Drop = (reason: DropReason, detail?: string) => OpenResult
type Base = EnvelopeHeader & { index?: number }

export async function open(frame: string | unknown, ctx: OpenContext): Promise<OpenResult> {
  const parsed = parseFrame(frame, ctx.limits)
  if (!parsed.ok) return parsed
  const e = parsed.envelope
  const drop: Drop = (reason, detail) => ({ ok: false, reason, detail, envelope: e })
  if (e.session !== ctx.keys.sessionId) return drop('BAD_TAG', 'another session')
  if (ctx.replay && !ctx.replay.check(e.from, e.seq)) return drop('REPLAY')
  const base: Base = { ...header(e), ...(ctx.index === undefined ? {} : { index: ctx.index }) }
  const result = isPlaintextType(e.type)
    ? openPlain(e, base, drop)
    : await openSealed(e, base, ctx, drop)
  if (result.ok) ctx.replay?.commit(e.from, e.seq)
  return result
}

function openPlain(e: Envelope, base: Base, drop: Drop): OpenResult {
  if (Ciphertext.safeParse(e.payload).success)
    return drop('PARSE', 'sealed payload on a plain type')
  const payload = PAYLOAD_SCHEMAS[e.type].safeParse(e.payload)
  if (!payload.success) return drop('PARSE', payload.error.message)
  return { ok: true, msg: { ...base, payload: payload.data } as Opened }
}

type KeyLookup =
  | { ok: true; keys: Uint8Array[]; kind: SealKind }
  | { ok: false; reason: 'UNKNOWN_EPOCH' | 'STAFF_ONLY' | 'CONTROLLER_ONLY' }

/**
 * Epochs whose players key may salt a frame to the controller: the current one, plus the one
 * before it for `REKEY_GRACE_MS` after the rotation so a device mid-reconnect is not cut off.
 * Older epochs never: a kicked device holds them and must not keep speaking to the controller.
 */
export function controllerEpochs(keys: SessionKeys, now: number): number[] {
  const current = keys.currentEpoch
  const since = keys.epochAddedAt(current)
  const previous = keys.knownEpochs.filter((e) => e < current).at(-1)
  const inGrace = since !== undefined && now - since < REKEY_GRACE_MS
  return previous !== undefined && inGrace ? [current, previous] : [current]
}

/**
 * The AES key(s) that may open `c`: a session key by epoch, or, for the controller, one
 * ECDH-derived key per admissible epoch (`controllerEpochs`), since `k: "c"` names no epoch.
 */
async function lookupKey(ctx: OpenContext, c: Ciphertext): Promise<KeyLookup> {
  if (c.k !== CONTROLLER_KEY_NAME) {
    const found = ctx.keys.lookup(c.k)
    return found.ok ? { ok: true, keys: [found.key], kind: found.kind } : found
  }
  if (!ctx.keys.controllerEcdh) return { ok: false, reason: 'CONTROLLER_ONLY' }
  const keys: Uint8Array[] = []
  for (const epoch of controllerEpochs(ctx.keys, (ctx.now ?? Date.now)())) {
    const e = ctx.keys.epoch(epoch)
    if (!e) continue
    keys.push(
      await controllerKey(
        ctx.crypto,
        ctx.keys,
        ctx.keys.controllerEcdh.privateKey,
        fromBase64Url(c.e!),
        e.playersEnc,
      ),
    )
  }
  return { ok: true, keys, kind: 'controller' }
}

async function openSealed(
  e: Envelope,
  base: Base,
  ctx: OpenContext,
  drop: Drop,
): Promise<OpenResult> {
  const ciphertext = Ciphertext.safeParse(e.payload)
  if (!ciphertext.success) return drop('PARSE', 'plain payload on a sealed type')
  const c = ciphertext.data
  const aad = aadFor(e)
  const type = e.type as SealedType

  // Verify before decrypting: a forged frame costs one signature check and nothing else.
  let signedBy: string | undefined
  if (e.sig !== undefined) {
    signedBy = await verifySignature(ctx, signingInput(aad, c), fromBase64Url(e.sig))
    if (signedBy === undefined) return drop('BAD_SIG')
  } else if (SIGNED_TYPES.has(type)) {
    return drop('UNSIGNED_CONTROLLER_MESSAGE')
  }

  const lookup = await lookupKey(ctx, c)
  if (!lookup.ok) return drop(lookup.reason)
  if (!allowedKeys(type, undefined, e.to).has(lookup.kind)) {
    return drop('WRONG_KEY', `${type} to ${e.to} under the ${lookup.kind} key`)
  }

  const opened = await decryptWithAny(ctx, lookup.keys, c, aad, type)
  if (!opened.ok) return drop(opened.reason, opened.detail)
  const payload = opened.payload
  if (!allowedKeys(type, payload, e.to).has(lookup.kind)) {
    return drop('WRONG_KEY', `${type} with staff content under the ${lookup.kind} key`)
  }
  if (signedBy === undefined && needsSignature(type, payload)) {
    return drop('UNSIGNED_CONTROLLER_MESSAGE')
  }
  if (signedBy !== undefined) {
    const scoped = checkScope(ctx, type, payload, signedBy)
    if (scoped !== undefined) return drop('OUT_OF_SCOPE', scoped)
    ctx.scope?.record(type, payload, signedBy)
  }
  const msg: Opened = { ...base, payload, key: lookup.kind } as Opened
  if (signedBy !== undefined) msg.signedBy = signedBy
  return { ok: true, msg }
}

/** Undefined when the signer may send this frame; else why not. */
function checkScope(
  ctx: OpenContext,
  type: SealedType,
  payload: unknown,
  signedBy: string,
): string | undefined {
  if (signedBy === 'host') return undefined
  if (HOST_ONLY_TYPES.has(type)) return `${type} is host-only`
  const scope = ctx.roster?.controllers.find((x) => x.id === signedBy)?.scope
  if (!scope) return 'signer is not in the roster'
  return inScope(type, payload, scope, ctx.scope?.openerOf(type, payload)) === true
    ? undefined
    : 'outside the co-controller scope'
}

type Decrypted =
  { ok: true; payload: unknown } | { ok: false; reason: 'BAD_TAG' | 'PARSE'; detail?: string }

/** Try each candidate key; only a tag failure moves on to the next one. */
async function decryptWithAny(
  ctx: OpenContext,
  keys: Uint8Array[],
  c: Ciphertext,
  aad: string,
  type: SealedType,
): Promise<Decrypted> {
  let last: Decrypted = { ok: false, reason: 'BAD_TAG' }
  for (const key of keys) {
    last = await decryptPayload(ctx, key, c, aad, type)
    if (last.ok || last.reason !== 'BAD_TAG') return last
  }
  return last
}

async function decryptPayload(
  ctx: OpenContext,
  key: Uint8Array,
  c: Ciphertext,
  aad: string,
  type: SealedType,
): Promise<Decrypted> {
  let plaintext: Uint8Array
  try {
    plaintext = await ctx.crypto.aesGcmOpen(key, fromBase64Url(c.n), utf8(aad), fromBase64Url(c.c))
  } catch {
    return { ok: false, reason: 'BAD_TAG' }
  }
  let json: unknown
  try {
    json = JSON.parse(fromUtf8(plaintext))
  } catch {
    return { ok: false, reason: 'PARSE', detail: 'payload is not JSON' }
  }
  const payload = PAYLOAD_SCHEMAS[type].safeParse(json)
  if (!payload.success) return { ok: false, reason: 'PARSE', detail: payload.error.message }
  return { ok: true, payload: payload.data }
}

async function verifySignature(
  ctx: OpenContext,
  data: Uint8Array,
  sig: Uint8Array,
): Promise<string | undefined> {
  if (await ctx.crypto.ecdsaVerify(ctx.controllerPub, data, sig)) return 'host'
  for (const co of ctx.roster?.controllers ?? []) {
    if (await ctx.crypto.ecdsaVerify(fromBase64Url(co.publicKey), data, sig)) return co.id
  }
  return undefined
}

function roleOf(target: string): string | undefined {
  return target.startsWith('role:') ? target.slice(5) : undefined
}

function targetsInScope(targets: readonly string[] | undefined, scope: ControllerScope): boolean {
  if (!targets) return true
  return targets.every((t) => {
    const role = roleOf(t)
    return role !== undefined && scope.roleIds.includes(role)
  })
}

/**
 * `T-1` matches `T-1` and `T-1-b` but not `T-10`: a prefix matches whole id segments, where a
 * segment boundary is any character that is not a letter or digit (or the prefix ends in one).
 */
export function rowMatchesPrefix(rowId: string, prefix: string): boolean {
  if (prefix.length === 0 || !rowId.startsWith(prefix)) return false
  if (rowId.length === prefix.length) return true
  return /[^A-Za-z0-9]$/.test(prefix) || /^[^A-Za-z0-9]/.test(rowId.slice(prefix.length))
}

/**
 * Whether a co-controller with `scope` may have sent this frame (#440). `openedBy` is who
 * opened the vote, survey or call a close refers to; a co-controller closes only its own.
 */
export function inScope(
  type: MessageType,
  payload: unknown,
  scope: ControllerScope,
  openedBy?: string,
): boolean {
  if (scope.all) return true
  const p = payload as { mselRowId?: string; targets?: string[]; channel?: string }
  switch (type) {
    case 'inject.release':
    case 'inject.recall':
      return (
        p.mselRowId !== undefined &&
        scope.rowPrefixes.some((prefix) => rowMatchesPrefix(p.mselRowId!, prefix)) &&
        targetsInScope(p.targets, scope)
      )
    case 'message.send':
      return targetsInScope(p.channel === undefined ? undefined : [p.channel], scope)
    case 'vote.open':
    case 'survey.open':
    case 'call.ring':
    case 'controller.notice':
      return targetsInScope(p.targets, scope)
    case 'vote.close':
    case 'survey.close':
    case 'call.end':
      return openedBy !== undefined && openedBy !== 'host'
    default:
      return false
  }
}
