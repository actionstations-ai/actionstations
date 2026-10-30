/**
 * An in-process session server for tests and for the controller's own connection: the server
 * contract of spec 0406 (`SessionHub`) with no sockets. Each `connect()` is a `Transport` whose
 * frames reach the hub on a microtask, so a test observes delivery with `settle()`. The LAN
 * server (#407) attaches the controller through this same adapter over its hub, so the
 * controller never opens a socket to its own computer.
 */
import type { CryptoProvider } from './crypto/provider'
import { SessionHub, type HubClient, type HubEvent, type HubStore, type StoredBlob } from './hub'
import type { ConnectionKind, Limits } from './protocol'
import type { ClientId, Envelope } from './schemas'
import type { Transport } from './transport'

export interface MemoryServerOptions {
  sessionId: string
  kind: ConnectionKind
  /** hex SHA-256 of the join token the controller registered. */
  joinTokenHash: string
  crypto: CryptoProvider
  version?: string
  now?: () => number
  store?: HubStore
  limits?: Partial<Limits>
  framesPerMinute?: number
  storedEnvelopes?: number
  storedBytes?: number
  rowWriteBudget?: number
  catchupBytes?: number
  onEvent?: (event: HubEvent) => void
}

export interface ConnectOptions {
  clientId: ClientId
  /** Participants: derived from the players root; the server compares its hash. */
  joinToken?: Uint8Array
  /**
   * Participants: binds `clientId` to this device. The first connection registers its hash;
   * later connections with the same id must present the same token.
   */
  resumeToken?: Uint8Array
  /** A connection that presented the controller token (`Bearer`), not a join token. */
  controller?: boolean
  /** With `controller`: false is a co-controller's connection (#517). */
  host?: boolean
}

interface Conn {
  open: boolean
  client?: HubClient
  frameCbs: Set<(frame: string) => void>
  closeCbs: Set<(code: number, reason: string) => void>
  /** Frames (and a close) that arrived before the client subscribed; flushed on subscribe. */
  pendingFrames: string[]
  pendingClose?: [number, string]
}

export class MemoryServer {
  readonly hub: SessionHub

  constructor(opts: MemoryServerOptions | { hub: SessionHub }) {
    this.hub = 'hub' in opts ? opts.hub : new SessionHub(opts)
  }

  get limits(): Limits {
    return this.hub.limits
  }
  /** Stored envelopes; arrival index is position + 1. */
  get stored(): Envelope[] {
    return this.hub.stored
  }
  get blobs(): Map<string, StoredBlob> {
    return this.hub.blobs
  }
  get blobBytes(): number {
    return this.hub.blobBytes
  }
  get ended(): boolean {
    return this.hub.ended
  }
  get sessionId() {
    return this.hub.sessionId
  }
  get connected(): ClientId[] {
    return this.hub.connected
  }
  get lastIndex(): number {
    return this.hub.lastIndex
  }

  /** `POST /v1/sessions/:id/join-token` after a rotation. */
  setJoinTokenHash(hex: string): void {
    this.hub.setJoinTokenHash(hex)
  }

  async connect(options: ConnectOptions): Promise<Transport> {
    const conn: Conn = {
      open: true,
      frameCbs: new Set(),
      closeCbs: new Set(),
      pendingFrames: [],
    }
    const transport = this.transportFor(conn)
    // The hub answers (hello or a refusal) before the caller subscribes; the buffers hold it.
    conn.client = await this.hub.attach(
      {
        send: (frame) => this.deliver(conn, frame),
        close: (code, reason) => this.closed(conn, code, reason),
      },
      options,
    )
    return transport
  }

  private transportFor(conn: Conn): Transport {
    return {
      send: (frame) => queueMicrotask(() => conn.client?.receive(frame)),
      close: (code = 1000, reason = '') => {
        if (!conn.open) return
        conn.client?.detach()
        this.closed(conn, code, reason)
      },
      onFrame: (cb) => {
        conn.frameCbs.add(cb)
        for (const frame of conn.pendingFrames.splice(0)) cb(frame)
        return () => conn.frameCbs.delete(cb)
      },
      onClose: (cb) => {
        conn.closeCbs.add(cb)
        if (conn.pendingClose) cb(...conn.pendingClose)
        return () => conn.closeCbs.delete(cb)
      },
    }
  }

  private deliver(conn: Conn, frame: string): void {
    if (!conn.open) return
    if (conn.frameCbs.size === 0) conn.pendingFrames.push(frame)
    for (const cb of conn.frameCbs) cb(frame)
  }

  private closed(conn: Conn, code: number, reason: string): void {
    if (!conn.open) return
    conn.open = false
    if (conn.closeCbs.size === 0) conn.pendingClose = [code, reason]
    for (const cb of conn.closeCbs) cb(code, reason)
  }

  /** `POST /v1/sessions/:id/kick`: close with 4003. The controller also rotates the key. */
  kick(clientId: ClientId): void {
    this.hub.kick(clientId)
  }

  /** After `session.end` fanned out: drop the store and close everyone. */
  end(): void {
    this.hub.end()
  }
}

/** Resolves after queued microtasks have run: lets a test observe in-memory delivery. */
export async function settle(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise<void>((r) => setTimeout(r, 0))
}
