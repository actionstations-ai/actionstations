/**
 * `LiveClient`: the connection-agnostic session state machine both the controller (Electron
 * main) and the player page run. It seals what it sends, opens what it receives through one
 * path (`codec.open`, replay guard included), filters frames for other roles, applies key
 * rotations, and moves blobs in chunks.
 */
import { toBase64Url } from './bytes'
import { BlobAssembler, BlobError, chunkBlob, openBlob, sealBlob, type Uploader } from './blob'
import {
  encodeFrame,
  isPlaintextType,
  open,
  ScopeState,
  seal,
  sealPlain,
  type Opened,
} from './codec'
import type { SessionKeys } from './crypto/keys'
import type { CryptoProvider, KeyPair, PrivateKey } from './crypto/provider'
import {
  DROP_REASONS,
  EPHEMERAL_TYPES,
  LIMITS,
  MAX_SEQ_HINT,
  PROTOCOL_VERSION,
  type DropReason,
  type Limits,
  type MessageType,
  type PlaintextType,
  type SealKind,
  type SealedType,
} from './protocol'
import { applyRekey, rotate, type RekeyClient, type Rotation } from './rekey'
import { ReplayGuard } from './replay'
import {
  STAFF_KINDS,
  type BlobMeta,
  type BlobRef,
  type ClientId,
  type ControllerRosterPayload,
  type Destination,
  type Envelope,
  type EnvelopeHeader,
  type JoinPayload,
  type PayloadInputByType,
} from './schemas'
import { MemoryKeyValue, type KeyValue, type Transport } from './transport'

export type LiveClientState = 'connecting' | 'hello' | 'joined' | 'ended' | 'closed'

export interface LiveClientOptions {
  transport: Transport
  keys: SessionKeys
  clientId: ClientId
  role: 'controller' | 'participant'
  crypto: CryptoProvider
  /** Host controller public key from the invite (the controller passes its own). */
  controllerPub: Uint8Array
  /** Controller only: signs controller types. */
  signer?: PrivateKey
  /** Participant: the pair whose public key goes in `join.ecdhPub`; needed to apply a rekey. */
  ecdh?: KeyPair
  roster?: ControllerRosterPayload
  storage?: KeyValue
  limits?: Limits
  now?: () => number
}

export interface SendOptions {
  key?: SealKind
  /** Sign a type that is not signed by default (a controller's `message.send`). */
  sign?: boolean
}

type Handler<T extends MessageType> = (msg: Opened<T>) => void
type DropHandler = (reason: DropReason, detail?: string, envelope?: Envelope) => void

/** Each announced cap clamped to the protocol's maximum for that connection kind. */
export function clampLimits(announced: Limits, kind: keyof typeof LIMITS): Limits {
  const max = LIMITS[kind]
  const out = { ...announced }
  for (const k of Object.keys(max) as (keyof Limits)[]) {
    out[k] = Math.max(1, Math.min(announced[k], max[k]))
  }
  return out
}

export class LiveClient {
  state: LiveClientState = 'connecting'
  /** Caps the server announced in `relay.hello`, clamped to the protocol's; else the given or relay defaults. */
  limits: Limits
  /** Last server arrival index applied from catch-up. */
  lastIndex = 0
  readonly replay = new ReplayGuard()
  readonly scope = new ScopeState()
  readonly drops: Record<DropReason, number> = Object.fromEntries(
    DROP_REASONS.map((r) => [r, 0]),
  ) as Record<DropReason, number>
  roster: ControllerRosterPayload | undefined

  private seq: number
  private destinations: Set<string> | undefined
  /** Live frames held back while a catch-up is in flight, applied after its last batch. */
  private heldBack: string[] | undefined
  private readonly handlers = new Map<MessageType, Set<Handler<MessageType>>>()
  private readonly anyHandlers = new Set<Handler<MessageType>>()
  private readonly dropHandlers = new Set<DropHandler>()
  private readonly stateHandlers = new Set<(state: LiveClientState) => void>()
  private readonly pendingPuts = new Map<
    string,
    { resolve: () => void; reject: (e: Error) => void }
  >()
  private readonly pendingGets = new Map<
    string,
    { assembler: BlobAssembler; resolve: (bytes: Uint8Array) => void; reject: (e: Error) => void }
  >()
  private readonly storage: KeyValue
  private readonly now: () => number
  private readonly uploader: Uploader

  constructor(private readonly opts: LiveClientOptions) {
    this.storage = opts.storage ?? new MemoryKeyValue()
    this.now = opts.now ?? (() => Date.now())
    this.limits = opts.limits ?? LIMITS.relay
    this.roster = opts.roster
    this.uploader = opts.role === 'controller' ? 'controller' : 'player'
    this.seq = Number(this.storage.get(this.storageKey('seq')) ?? 0)
    this.lastIndex = Number(this.storage.get(this.storageKey('index')) ?? 0)
    opts.transport.onFrame((frame) => void this.receive(frame))
    opts.transport.onClose(() => this.setState('closed'))
  }

  get clientId(): ClientId {
    return this.opts.clientId
  }

  get keys(): SessionKeys {
    return this.opts.keys
  }

  private storageKey(what: string): string {
    return `as-live:${this.opts.keys.sessionId}:${this.opts.clientId}:${what}`
  }

  private setState(state: LiveClientState): void {
    if (this.state === state || this.state === 'closed') return
    this.state = state
    for (const cb of this.stateHandlers) cb(state)
  }

  onState(cb: (state: LiveClientState) => void): () => void {
    this.stateHandlers.add(cb)
    return () => this.stateHandlers.delete(cb)
  }

  /** The role and team destinations this device filters on (from `welcome`). */
  setDestinations(destinations: Iterable<Destination>): void {
    this.destinations = new Set(destinations)
  }

  on<T extends MessageType>(type: T, cb: Handler<T>): () => void {
    let set = this.handlers.get(type)
    if (!set) this.handlers.set(type, (set = new Set()))
    set.add(cb as Handler<MessageType>)
    return () => set!.delete(cb as Handler<MessageType>)
  }

  onAny(cb: Handler<MessageType>): () => void {
    this.anyHandlers.add(cb)
    return () => this.anyHandlers.delete(cb)
  }

  onDropped(cb: DropHandler): () => void {
    this.dropHandlers.add(cb)
    return () => this.dropHandlers.delete(cb)
  }

  private header<T extends MessageType>(type: T, to: Destination): EnvelopeHeader & { type: T } {
    this.seq += 1
    this.storage.set(this.storageKey('seq'), String(this.seq))
    return {
      v: PROTOCOL_VERSION,
      session: this.opts.keys.sessionId,
      seq: this.seq,
      from: this.opts.clientId,
      to,
      type,
      ts: this.now(),
    }
  }

  async send<T extends MessageType>(
    type: T,
    to: Destination,
    payload: PayloadInputByType[T],
    opts: SendOptions = {},
  ): Promise<Envelope> {
    if (this.state === 'closed' || this.state === 'ended')
      throw new Error(`Cannot send: ${this.state}`)
    const h = this.header(type, to)
    const body = type === 'join' ? await this.withStaffProof(payload as JoinPayload) : payload
    const envelope = isPlaintextType(type)
      ? sealPlain(h as EnvelopeHeader & { type: PlaintextType }, body as never)
      : await seal(
          this.opts.crypto,
          this.opts.keys,
          h as EnvelopeHeader & { type: SealedType },
          body as never,
          { key: opts.key, signer: this.opts.signer, sign: opts.sign },
        )
    this.opts.transport.send(encodeFrame(envelope))
    return envelope
  }

  /** A staff kind's `join` carries the proof the controller checks; a player's never does. */
  private async withStaffProof(join: JoinPayload): Promise<JoinPayload> {
    if (join.staffProof !== undefined || !STAFF_KINDS.has(join.kind) || !this.opts.ecdh) return join
    const proof = await this.opts.keys.staffProof(this.opts.clientId, this.opts.ecdh.publicKey)
    return proof ? { ...join, staffProof: toBase64Url(proof) } : join
  }

  /** Ask the server for stored frames after `after`; live frames are held until the last batch. */
  requestCatchup(after = this.lastIndex): void {
    this.heldBack ??= []
    void this.send('catchup.request', 'controller', { after })
  }

  /** Controller: rotate to a new epoch, excluding `kicked`. Sends one `session.rekey` per kept client. */
  async rotate(
    clients: readonly RekeyClient[],
    kicked: readonly ClientId[] = [],
  ): Promise<Rotation> {
    if (this.opts.role !== 'controller') throw new Error('Only the controller rotates keys')
    const previous = this.opts.keys.currentEpoch
    const rotation = await rotate(this.opts.crypto, this.opts.keys, clients, kicked)
    for (const m of rotation.messages) {
      const h = this.header('session.rekey', m.to)
      const envelope = await seal(this.opts.crypto, this.opts.keys, h, m.payload, {
        epoch: previous,
        signer: this.opts.signer,
      })
      this.opts.transport.send(encodeFrame(envelope))
    }
    return rotation
  }

  /** Seal, upload in chunks, resolve with the reference once the server confirmed storage. */
  async putBlob(
    meta: BlobMeta,
    plaintext: Uint8Array,
    opts: { key?: 'players' | 'staff' } = {},
  ): Promise<BlobRef> {
    const { ref, sealed } = await sealBlob(this.opts.crypto, this.opts.keys, meta, plaintext, {
      key: opts.key,
      limits: this.limits,
      uploader: this.uploader,
    })
    const stored = new Promise<void>((resolve, reject) =>
      this.pendingPuts.set(ref.blobId, { resolve, reject }),
    )
    for (const chunk of chunkBlob(ref.blobId, sealed, this.limits.chunkBytes)) {
      await this.send('relay.blob.put', 'controller', chunk)
    }
    await stored
    return ref
  }

  async getBlob(ref: BlobRef): Promise<Uint8Array> {
    const sealed = new Promise<Uint8Array>((resolve, reject) =>
      this.pendingGets.set(ref.blobId, {
        assembler: new BlobAssembler(
          ref.blobId,
          BlobAssembler.sealedSize(ref),
          this.limits.chunkBytes,
        ),
        resolve,
        reject,
      }),
    )
    await this.send('relay.blob.get', 'controller', { blobId: ref.blobId })
    return openBlob(this.opts.crypto, this.opts.keys, ref, await sealed)
  }

  private drop(reason: DropReason, detail?: string, envelope?: Envelope): void {
    this.drops[reason] += 1
    for (const cb of this.dropHandlers) cb(reason, detail, envelope)
  }

  private async receive(frame: string): Promise<void> {
    // During a catch-up, live sealed frames wait so a stored frame is never dropped as a replay
    // of a newer live one from the same sender; server frames still flow.
    if (this.heldBack && !isServerFrame(frame)) {
      this.heldBack.push(frame)
      return
    }
    await this.openAndDispatch(frame)
  }

  private async openAndDispatch(frame: string | Envelope, index?: number): Promise<void> {
    const result = await open(frame, this.openContext(index))
    if (!result.ok) return this.drop(result.reason, result.detail, result.envelope)
    await this.dispatch(result.msg)
  }

  private openContext(index?: number) {
    return {
      crypto: this.opts.crypto,
      keys: this.opts.keys,
      controllerPub: this.opts.controllerPub,
      roster: this.roster,
      scope: this.scope,
      replay: this.replay,
      limits: this.limits,
      ...(index === undefined ? {} : { index }),
    }
  }

  private isForMe(msg: Opened): boolean {
    if (this.opts.role === 'controller') return true
    if (msg.to === 'all' || msg.to === 'controller') return msg.to !== 'controller'
    if (msg.to.startsWith('client:')) return msg.to === `client:${this.opts.clientId}`
    return this.destinations === undefined || this.destinations.has(msg.to)
  }

  private async dispatch(msg: Opened): Promise<void> {
    if (!isPlaintextType(msg.type) && !this.isForMe(msg)) return this.drop('NOT_FOR_ME', undefined)
    switch (msg.type) {
      case 'relay.hello':
        this.applyHello(msg as Opened<'relay.hello'>)
        break
      case 'catchup.batch':
        await this.applyCatchup(msg as Opened<'catchup.batch'>)
        break
      case 'welcome':
        if (!(msg as Opened<'welcome'>).payload.rejected) this.setState('joined')
        break
      case 'session.rekey':
        if (!(await this.applyRekey(msg as Opened<'session.rekey'>))) return
        break
      case 'controller.roster':
        this.applyRoster(msg as Opened<'controller.roster'>)
        break
      case 'session.end':
        this.setState('ended')
        break
      case 'relay.blob.done':
        this.blobDone(msg as Opened<'relay.blob.done'>)
        break
      case 'relay.blob.chunk':
        this.blobChunk(msg as Opened<'relay.blob.chunk'>)
        break
      case 'relay.error':
        this.relayError(msg as Opened<'relay.error'>)
        break
    }
    for (const cb of this.handlers.get(msg.type) ?? []) cb(msg)
    for (const cb of this.anyHandlers) cb(msg)
  }

  /** The server's hello is advisory: caps are clamped to the protocol's and the seq hint bounded. */
  private applyHello(msg: Opened<'relay.hello'>): void {
    const { caps, server, yourLastSeq } = msg.payload
    this.limits = clampLimits(caps, server.kind)
    if (Number.isInteger(yourLastSeq) && yourLastSeq <= MAX_SEQ_HINT && yourLastSeq > this.seq) {
      this.seq = yourLastSeq
      this.storage.set(this.storageKey('seq'), String(this.seq))
    }
    this.setState(this.opts.role === 'controller' ? 'joined' : 'hello')
  }

  private async applyCatchup(batch: Opened<'catchup.batch'>): Promise<void> {
    for (const { i, e } of batch.payload.entries) {
      // Stored frames are session content only; a server frame or a nested batch inside one is bogus.
      if (EPHEMERAL_TYPES.has(e.type) || e.from === 'server') {
        this.drop('PARSE', `${e.type} inside a catch-up batch`, e)
        continue
      }
      await this.openAndDispatch(e, i)
    }
    if (batch.payload.to > this.lastIndex) {
      this.lastIndex = batch.payload.to
      this.storage.set(this.storageKey('index'), String(this.lastIndex))
    }
    if (batch.payload.done) await this.releaseHeldBack()
  }

  private async releaseHeldBack(): Promise<void> {
    const frames = this.heldBack ?? []
    this.heldBack = undefined
    for (const frame of frames) await this.openAndDispatch(frame)
  }

  private async applyRekey(msg: Opened<'session.rekey'>): Promise<boolean> {
    if (!this.opts.ecdh) return (this.drop('WRONG_KEY', 'no ECDH key to unwrap a rekey'), false)
    try {
      await applyRekey(
        this.opts.crypto,
        this.opts.keys,
        this.opts.clientId,
        this.opts.ecdh,
        msg.payload,
      )
      return true
    } catch (err) {
      this.drop('BAD_TAG', `rekey: ${(err as Error).message}`)
      return false
    }
  }

  private applyRoster(msg: Opened<'controller.roster'>): void {
    if (msg.signedBy !== 'host') return
    if (this.roster && this.roster.revision >= msg.payload.revision) return
    this.roster = msg.payload
  }

  private blobDone(msg: Opened<'relay.blob.done'>): void {
    const pending = this.pendingPuts.get(msg.payload.blobId)
    if (!pending) return
    this.pendingPuts.delete(msg.payload.blobId)
    if (msg.payload.stored) pending.resolve()
    else pending.reject(new BlobError('INCOMPLETE', 'Server did not store the blob'))
  }

  private blobChunk(msg: Opened<'relay.blob.chunk'>): void {
    const pending = this.pendingGets.get(msg.payload.blobId)
    if (!pending) return
    try {
      if (pending.assembler.add(msg.payload)) {
        this.pendingGets.delete(msg.payload.blobId)
        pending.resolve(pending.assembler.bytes())
      }
    } catch (err) {
      this.pendingGets.delete(msg.payload.blobId)
      pending.reject(err as Error)
    }
  }

  private relayError(msg: Opened<'relay.error'>): void {
    const { blobId, code, message } = msg.payload
    if (!blobId) return
    const error = new BlobError(
      code === 'BLOB_TOO_LARGE' ? 'BLOB_TOO_LARGE' : 'INCOMPLETE',
      message,
    )
    this.pendingPuts.get(blobId)?.reject(error)
    this.pendingPuts.delete(blobId)
    this.pendingGets.get(blobId)?.reject(error)
    this.pendingGets.delete(blobId)
  }

  close(code?: number, reason?: string): void {
    this.opts.transport.close(code, reason)
    this.setState('closed')
  }
}

/** Cheap check without a full parse: server frames carry `"from":"server"`. */
function isServerFrame(frame: string): boolean {
  return frame.includes('"from":"server"')
}

/** 128 random bits as a client or blob id. */
export function newId(crypto: CryptoProvider): string {
  return toBase64Url(crypto.random(16))
}
