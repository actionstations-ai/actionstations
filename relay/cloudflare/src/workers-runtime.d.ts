/**
 * The slice of the Workers runtime this package uses, declared here instead of pulling in
 * `@cloudflare/workers-types`: that package replaces the DOM globals the shared protocol code
 * (`src/shared/live`) compiles against, and the two disagree on `globalThis.crypto` and
 * `TextDecoder`. Signatures follow developers.cloudflare.com/durable-objects (SQLite storage,
 * WebSocket hibernation API) and /workers/runtime-apis.
 */

type SqlStorageValue = ArrayBuffer | string | number | null

interface SqlStorageCursor<T extends Record<string, SqlStorageValue>> extends Iterator<T> {
  toArray(): T[]
  one(): T
  raw(): IterableIterator<SqlStorageValue[]>
  columnNames: string[]
  readonly rowsRead: number
  readonly rowsWritten: number
  [Symbol.iterator](): IterableIterator<T>
}

interface SqlStorage {
  exec<T extends Record<string, SqlStorageValue> = Record<string, SqlStorageValue>>(
    query: string,
    ...bindings: SqlStorageValue[]
  ): SqlStorageCursor<T>
}

interface DurableObjectStorage {
  readonly sql: SqlStorage
  deleteAll(): Promise<void>
  getAlarm(): Promise<number | null>
  setAlarm(scheduledTime: number | Date): Promise<void>
  deleteAlarm(): Promise<void>
}

interface DurableObjectId {
  toString(): string
  equals(other: DurableObjectId): boolean
  readonly name?: string
}

interface DurableObjectState {
  readonly id: DurableObjectId
  readonly storage: DurableObjectStorage
  waitUntil(promise: Promise<unknown>): void
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>
  acceptWebSocket(ws: WebSocket, tags?: string[]): void
  getWebSockets(tag?: string): WebSocket[]
  setWebSocketAutoResponse(pair?: WebSocketRequestResponsePair): void
}

interface DurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): DurableObjectStub
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

/** The hibernation API adds per-socket attachments to the standard WebSocket. */
interface WebSocket {
  accept(): void
  serializeAttachment(attachment: unknown): void
  deserializeAttachment(): unknown
}

declare class WebSocketPair {
  constructor()
  readonly 0: WebSocket
  readonly 1: WebSocket
}

declare class WebSocketRequestResponsePair {
  constructor(request: string, response: string)
  readonly request: string
  readonly response: string
}

/** A `101` response carries the client end of a pair. */
interface ResponseInit {
  webSocket?: WebSocket | null
}
