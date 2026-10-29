/**
 * An evaluator's observations as the device keeps them (spec 0416 FR-7, NFR-5). Each is keyed by
 * its `observationId`; every save raises `revision`, and the book remembers the highest revision
 * the controller has accepted (`sentRevision`) so the form can say what is still waiting. The
 * book is saved in IndexedDB so a reload keeps the revision counter and the ratings; nothing is
 * written once the tab is closed and the browser clears site data (FR-12). The offline outbox
 * (`app/queue.ts`) carries the frames; this file is only the local record.
 */
import type { EvalObservationPayload } from '../../../shared/live/schemas'

export type Rating = NonNullable<EvalObservationPayload['rating']>
export const RATING_ORDER: readonly Rating[] = ['met', 'partial', 'not_met', 'not_observed']

/** Most distinct observations one device keeps (the controller refuses more). */
export const MAX_LOCAL_OBSERVATIONS = 2000
export const MAX_NOTE = 4000

export interface LocalObservation {
  sessionId: string
  observationId: string
  revision: number
  /** Highest revision the connection took; below `revision` means waiting to send. */
  sentRevision: number
  kind: 'task' | 'note'
  taskId?: string
  criterionId?: string
  capability?: string
  rating?: Rating
  notes: string
  exerciseTime: string
  observedAt: number
  mselRowId?: string
}

export interface ObservationStore {
  put(o: LocalObservation): Promise<void>
  list(sessionId: string): Promise<LocalObservation[]>
  clear(sessionId: string): Promise<void>
}

export class MemoryObservationStore implements ObservationStore {
  readonly rows = new Map<string, LocalObservation>()
  async put(o: LocalObservation) {
    this.rows.set(`${o.sessionId}:${o.observationId}`, { ...o })
  }
  async list(sessionId: string) {
    return [...this.rows.values()].filter((o) => o.sessionId === sessionId).map((o) => ({ ...o }))
  }
  async clear(sessionId: string) {
    for (const [k, o] of [...this.rows]) if (o.sessionId === sessionId) this.rows.delete(k)
  }
}

const DB_NAME = 'as-player-observations'
const STORE = 'observations'

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

export class IndexedDbObservationStore implements ObservationStore {
  private db: Promise<IDBDatabase> | undefined

  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = this.factory.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, {
          keyPath: ['sessionId', 'observationId'],
        })
        store.createIndex('session', 'sessionId', { unique: false })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    })
    return this.db
  }

  private async tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.open()).transaction(STORE, mode).objectStore(STORE)
  }

  async put(o: LocalObservation) {
    await request((await this.tx('readwrite')).put(o))
  }

  async list(sessionId: string) {
    const store = await this.tx('readonly')
    return request<LocalObservation[]>(
      store.index('session').getAll(sessionId) as IDBRequest<LocalObservation[]>,
    )
  }

  async clear(sessionId: string) {
    for (const o of await this.list(sessionId)) {
      await request((await this.tx('readwrite')).delete([o.sessionId, o.observationId]))
    }
  }
}

/** The browser store when IndexedDB works, else memory (the form still works until a reload). */
export function createObservationStore(): ObservationStore {
  try {
    if (typeof indexedDB !== 'undefined') return new IndexedDbObservationStore()
  } catch {
    // blocked storage
  }
  return new MemoryObservationStore()
}

/** What the form hands over for one save: a task rating or a general note. */
export interface ObservationInput {
  /** An existing observation to revise; omitted for a new one. */
  observationId?: string
  kind: 'task' | 'note'
  taskId?: string
  criterionId?: string
  capability?: string
  rating?: Rating
  notes: string
  exerciseTime: string
  mselRowId?: string
}

export type SaveResult =
  { ok: true; observation: LocalObservation } | { ok: false; reason: 'limit' | 'ended' }

export class ObservationBook {
  private readonly byId = new Map<string, LocalObservation>()

  constructor(
    private readonly store: ObservationStore,
    private readonly sessionId: string,
    private readonly newId: () => string,
    private readonly now: () => number,
  ) {}

  async load(): Promise<void> {
    this.byId.clear()
    for (const o of await this.store.list(this.sessionId)) this.byId.set(o.observationId, o)
  }

  /** Newest first. */
  all(): LocalObservation[] {
    return [...this.byId.values()].sort((a, b) => b.observedAt - a.observedAt)
  }

  get(observationId: string): LocalObservation | undefined {
    return this.byId.get(observationId)
  }

  /** The task's or criterion's single observation (one per task, revised in place). */
  forTask(taskId: string): LocalObservation | undefined {
    return [...this.byId.values()].find((o) => o.kind === 'task' && o.taskId === taskId)
  }

  /** Waiting to send: saved here, not yet taken by the connection. */
  pending(): number {
    return [...this.byId.values()].filter((o) => o.sentRevision < o.revision).length
  }

  async save(input: ObservationInput): Promise<SaveResult> {
    const prior =
      (input.observationId ? this.byId.get(input.observationId) : undefined) ??
      (input.kind === 'task' && input.taskId ? this.forTask(input.taskId) : undefined)
    if (!prior && this.byId.size >= MAX_LOCAL_OBSERVATIONS) return { ok: false, reason: 'limit' }
    const next: LocalObservation = {
      sessionId: this.sessionId,
      observationId: prior?.observationId ?? this.newId(),
      revision: (prior?.revision ?? 0) + 1,
      sentRevision: prior?.sentRevision ?? 0,
      kind: input.kind,
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.criterionId ? { criterionId: input.criterionId } : {}),
      ...(input.capability ? { capability: input.capability } : {}),
      ...(input.rating ? { rating: input.rating } : {}),
      notes: input.notes.slice(0, MAX_NOTE),
      exerciseTime: input.exerciseTime,
      observedAt: prior?.observedAt ?? this.now(),
      ...(input.mselRowId ? { mselRowId: input.mselRowId } : {}),
    }
    this.byId.set(next.observationId, next)
    await this.store.put(next)
    return { ok: true, observation: next }
  }

  async markSent(observationId: string, revision: number): Promise<void> {
    const o = this.byId.get(observationId)
    if (!o || revision <= o.sentRevision) return
    const next = { ...o, sentRevision: Math.min(revision, o.revision) }
    this.byId.set(observationId, next)
    await this.store.put(next)
  }

  async clear(): Promise<void> {
    this.byId.clear()
    await this.store.clear(this.sessionId)
  }
}

/** The `eval.observation` payload for a saved observation. */
export function toPayload(o: LocalObservation): EvalObservationPayload {
  return {
    observationId: o.observationId,
    revision: o.revision,
    kind: o.kind,
    ...(o.taskId ? { taskId: o.taskId } : {}),
    ...(o.criterionId ? { criterionId: o.criterionId } : {}),
    ...(o.capability ? { capability: o.capability } : {}),
    ...(o.rating ? { rating: o.rating } : {}),
    notes: o.notes,
    exerciseTime: o.exerciseTime,
    observedAt: o.observedAt,
    ...(o.mselRowId ? { mselRowId: o.mselRowId } : {}),
  }
}
