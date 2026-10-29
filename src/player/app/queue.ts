/**
 * The offline outbox (NFR-6): actions a player takes while disconnected (receipts, messages,
 * votes, observations in later specs) wait here and go out on reconnect, once each, in order.
 * Every action has its own id so the controller can ignore a duplicate. The store is IndexedDB
 * in the browser; tests use the in-memory store through the same interface.
 */
import type { MessageType } from '../../shared/live/protocol'
import type { Destination } from '../../shared/live/schemas'

export interface OutboxAction {
  id: string
  sessionId: string
  type: MessageType
  to: Destination
  payload: Record<string, unknown>
  createdAt: number
}

export interface OutboxStore {
  put(action: OutboxAction): Promise<void>
  /** Oldest first, this session only. */
  list(sessionId: string): Promise<OutboxAction[]>
  remove(id: string): Promise<void>
  clear(sessionId: string): Promise<void>
}

export class MemoryOutboxStore implements OutboxStore {
  readonly actions = new Map<string, OutboxAction>()
  async put(action: OutboxAction) {
    this.actions.set(action.id, action)
  }
  async list(sessionId: string) {
    return [...this.actions.values()]
      .filter((a) => a.sessionId === sessionId)
      .sort((a, b) => a.createdAt - b.createdAt)
  }
  async remove(id: string) {
    this.actions.delete(id)
  }
  async clear(sessionId: string) {
    for (const a of [...this.actions.values()])
      if (a.sessionId === sessionId) this.actions.delete(a.id)
  }
}

const DB_NAME = 'as-player-outbox'
const STORE = 'actions'

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

export class IndexedDbOutboxStore implements OutboxStore {
  private db: Promise<IDBDatabase> | undefined

  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = this.factory.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('session', 'sessionId', { unique: false })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    })
    return this.db
  }

  private async tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.open()
    return db.transaction(STORE, mode).objectStore(STORE)
  }

  async put(action: OutboxAction) {
    await request((await this.tx('readwrite')).put(action))
  }

  async list(sessionId: string) {
    const store = await this.tx('readonly')
    const all = await request<OutboxAction[]>(
      store.index('session').getAll(sessionId) as IDBRequest<OutboxAction[]>,
    )
    return all.sort((a, b) => a.createdAt - b.createdAt)
  }

  async remove(id: string) {
    await request((await this.tx('readwrite')).delete(id))
  }

  async clear(sessionId: string) {
    for (const a of await this.list(sessionId)) await this.remove(a.id)
  }
}

/** The browser store when IndexedDB exists, else memory (the page still works, nothing survives a reload). */
export function createOutboxStore(): OutboxStore {
  try {
    if (typeof indexedDB !== 'undefined') return new IndexedDbOutboxStore()
  } catch {
    // blocked storage
  }
  return new MemoryOutboxStore()
}

export type Sender = (action: OutboxAction) => Promise<void>

/**
 * The outbox: `enqueue` saves then tries to send when online; `drain` sends everything saved,
 * oldest first, stopping at the first failure (the rest wait for the next reconnect).
 */
export class Outbox {
  private draining: Promise<number> | undefined

  constructor(
    private readonly store: OutboxStore,
    private readonly sessionId: string,
    private readonly send: Sender,
    private readonly online: () => boolean,
  ) {}

  async enqueue(
    action: Omit<OutboxAction, 'sessionId' | 'createdAt'>,
    now = Date.now(),
  ): Promise<void> {
    await this.store.put({ ...action, sessionId: this.sessionId, createdAt: now })
    if (this.online()) await this.drain()
  }

  /** Sends what is saved; resolves with how many went out. Concurrent calls share one run. */
  drain(): Promise<number> {
    this.draining ??= this.run().finally(() => (this.draining = undefined))
    return this.draining
  }

  private async run(): Promise<number> {
    let sent = 0
    for (const action of await this.store.list(this.sessionId)) {
      if (!this.online()) break
      try {
        await this.send(action)
      } catch {
        break
      }
      await this.store.remove(action.id)
      sent += 1
    }
    return sent
  }

  pending(): Promise<OutboxAction[]> {
    return this.store.list(this.sessionId)
  }

  clear(): Promise<void> {
    return this.store.clear(this.sessionId)
  }
}
