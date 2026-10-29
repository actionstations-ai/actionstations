/**
 * A stand-in for the parts of the Workers runtime the session object touches, so the adapter
 * runs under the root Vitest (vitest 5) where `@cloudflare/vitest-pool-workers` (vitest 4) cannot:
 * `SqlStorage` on `node:sqlite`, a `DurableObjectState` with alarms and hibernatable sockets,
 * and a `WebSocketPair` whose server end delivers events to whichever object is bound to the
 * state (so a test can "hibernate" by binding a fresh object).
 */
import { DatabaseSync, type SqlValue } from 'node:sqlite'
import type { Transport } from '@shared/live/transport'

type Row = Record<string, SqlStorageValue>

export class SqlStorageShim {
  constructor(readonly db = new DatabaseSync(':memory:')) {}

  exec<T extends Row = Row>(query: string, ...bindings: SqlStorageValue[]): SqlStorageCursor<T> {
    const statements = query.split(';').filter((s) => s.trim().length > 0)
    if (statements.length > 1 && bindings.length === 0) {
      this.db.exec(query)
      return cursor<T>([])
    }
    const rows = this.db.prepare(query).all(...(bindings as SqlValue[])) as T[]
    return cursor(rows)
  }

  /** What `storage.deleteAll()` does to SQLite-backed objects: every table goes. */
  dropAll(): void {
    const tables = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
      .all() as { name: string }[]
    for (const { name } of tables) this.db.exec(`DROP TABLE "${name}"`)
  }

  count(table: string): number {
    return Number((this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n)
  }
}

function cursor<T extends Row>(rows: T[]): SqlStorageCursor<T> {
  let i = 0
  const c = {
    toArray: () => rows,
    one: () => {
      if (rows.length !== 1) throw new Error(`Expected one row, got ${rows.length}`)
      return rows[0]
    },
    raw: () => rows.map((r) => Object.values(r))[Symbol.iterator](),
    columnNames: rows.length ? Object.keys(rows[0]!) : [],
    rowsRead: rows.length,
    rowsWritten: 0,
    next: () => (i < rows.length ? { done: false, value: rows[i++] } : { done: true }),
    [Symbol.iterator]() {
      return this
    },
  }
  return c as unknown as SqlStorageCursor<T>
}

/** The object currently bound to a state: who receives socket events. */
export interface SocketHandler {
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void>
  webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void>
  webSocketError(ws: WebSocket, error: unknown): Promise<void>
}

type MessageListener = (ev: { data: string | ArrayBuffer }) => void
type CloseListener = (ev: { code: number; reason: string }) => void

export class FakeSocket {
  peer!: FakeSocket
  readyState = 1
  tags: string[] = []
  /** Set on the server end when the state accepts it. */
  state: FakeState | undefined
  private attachment: string | null = null
  private readonly messageListeners: MessageListener[] = []
  private readonly closeListeners: CloseListener[] = []
  private readonly pendingMessages: (string | ArrayBuffer)[] = []
  private pendingClose: { code: number; reason: string } | undefined

  send(data: string | ArrayBuffer): void {
    if (this.readyState !== 1) throw new Error('Socket is closed')
    const peer = this.peer
    queueMicrotask(() => peer.receive(data))
  }

  private receive(data: string | ArrayBuffer): void {
    if (this.readyState !== 1) return
    if (this.state) {
      void this.state.handler?.webSocketMessage(this as unknown as WebSocket, data)
      return
    }
    if (this.messageListeners.length === 0) this.pendingMessages.push(data)
    for (const cb of this.messageListeners) cb({ data })
  }

  /** Like a real socket: frames sent before the close still reach the peer, then the close does. */
  close(code = 1000, reason = ''): void {
    if (this.readyState !== 1) return
    this.readyState = 3
    this.state?.sockets.delete(this)
    const peer = this.peer
    queueMicrotask(() => {
      peer.readyState = 3
      peer.state?.sockets.delete(peer)
      peer.closed(code, reason)
    })
  }

  private closed(code: number, reason: string): void {
    if (this.state) {
      void this.state.handler?.webSocketClose(this as unknown as WebSocket, code, reason, true)
      return
    }
    if (this.closeListeners.length === 0) this.pendingClose = { code, reason }
    for (const cb of this.closeListeners) cb({ code, reason })
  }

  addEventListener(type: 'message', cb: MessageListener): void
  addEventListener(type: 'close', cb: CloseListener): void
  addEventListener(type: 'message' | 'close', cb: MessageListener | CloseListener): void {
    if (type === 'message') {
      this.messageListeners.push(cb as MessageListener)
      for (const data of this.pendingMessages.splice(0)) (cb as MessageListener)({ data })
    } else {
      this.closeListeners.push(cb as CloseListener)
      if (this.pendingClose) (cb as CloseListener)(this.pendingClose)
    }
  }

  accept(): void {}

  serializeAttachment(value: unknown): void {
    this.attachment = JSON.stringify(value)
  }

  deserializeAttachment(): unknown {
    return this.attachment === null ? null : JSON.parse(this.attachment)
  }
}

export function fakePair(): { client: FakeSocket; server: FakeSocket } {
  const client = new FakeSocket()
  const server = new FakeSocket()
  client.peer = server
  server.peer = client
  return { client, server }
}

/** The client end of a fake socket as the protocol's `Transport`. */
export function transportOf(client: FakeSocket): Transport {
  return {
    send: (frame) => client.send(frame),
    close: (code, reason) => client.close(code, reason),
    onFrame: (cb) => {
      client.addEventListener('message', (ev) => cb(String(ev.data)))
      return () => {}
    },
    onClose: (cb) => {
      client.addEventListener('close', (ev) => cb(ev.code, ev.reason))
      return () => {}
    },
  }
}

export class FakeState {
  readonly sql = new SqlStorageShim()
  alarm: number | null = null
  readonly sockets = new Set<FakeSocket>()
  handler: SocketHandler | undefined
  autoResponse: unknown
  readonly id = { toString: () => 'fake-object', equals: () => false, name: 'fake' }
  readonly storage = {
    sql: this.sql as unknown as SqlStorage,
    deleteAll: async () => {
      this.sql.dropAll()
      this.alarm = null
    },
    setAlarm: async (at: number | Date) => {
      this.alarm = typeof at === 'number' ? at : at.getTime()
    },
    getAlarm: async () => this.alarm,
    deleteAlarm: async () => {
      this.alarm = null
    },
  }

  acceptWebSocket(ws: WebSocket, tags: string[] = []): void {
    const socket = ws as unknown as FakeSocket
    socket.state = this
    socket.tags = tags
    this.sockets.add(socket)
  }

  getWebSockets(tag?: string): WebSocket[] {
    return [...this.sockets].filter(
      (s) => s.readyState === 1 && (!tag || s.tags.includes(tag)),
    ) as unknown as WebSocket[]
  }

  setWebSocketAutoResponse(pair: unknown): void {
    this.autoResponse = pair
  }

  waitUntil(): void {}

  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
    return fn()
  }

  /** The object that receives socket events; rebinding a fresh object is a hibernation. */
  bind(handler: SocketHandler): void {
    this.handler = handler
  }

  asState(): DurableObjectState {
    return this as unknown as DurableObjectState
  }
}

/** What `vi.mock('../src/platform')` returns: pairs and 101 responses without the runtime. */
export const platformShim = {
  websocketPair: () => fakePair() as unknown as { client: WebSocket; server: WebSocket },
  upgradeResponse: (client: WebSocket) =>
    ({ status: 101, webSocket: client }) as unknown as Response,
  pingPongPair: () => ({ request: '{"ping":1}', response: '{"pong":1}' }),
}

/** The socket an upgrade response carries. */
export function socketOf(response: Response): FakeSocket {
  const ws = (response as unknown as { webSocket?: FakeSocket }).webSocket
  if (response.status !== 101 || !ws) throw new Error(`Not an upgrade: ${response.status}`)
  return ws
}
