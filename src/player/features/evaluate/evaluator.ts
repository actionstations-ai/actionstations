/**
 * The evaluator's side of the page (spec 0416): the assignment the controller sent, the local
 * observation book, and the actions the form calls. The session owns one of these per seat and
 * hands it the pieces it needs (the outbox, the clock, ids); this class holds no transport.
 */
import { Store } from '../../app/store'
import { applyAssignment, type Assignment } from './assignment'
import {
  ObservationBook,
  toPayload,
  type LocalObservation,
  type ObservationInput,
  type ObservationStore,
  type SaveResult,
} from './observations'

export interface EvaluateState {
  assignment?: Assignment
  observations: LocalObservation[]
  /** Rows whose Watch-for entry the evaluator dismissed. */
  dismissedRows: ReadonlySet<string>
  /** The session ended: the form is read-only (FR-12). */
  ended: boolean
}

export interface EvaluatorDeps {
  sessionId: string
  store: ObservationStore
  newId: () => string
  now: () => number
  /** Exercise time `H:MM` on the controller's clock, now. */
  exerciseTime: () => string
  /** Queue one frame for the controller; resolves once it is saved to send (or sent). */
  enqueue: (action: {
    id: string
    payload: Record<string, unknown>
    createdAt: number
  }) => Promise<void>
}

export class EvaluatorFeature {
  readonly state = new Store<EvaluateState>({
    observations: [],
    dismissedRows: new Set(),
    ended: false,
  })
  private readonly book: ObservationBook
  private lastCreatedAt = 0

  constructor(private readonly deps: EvaluatorDeps) {
    this.book = new ObservationBook(deps.store, deps.sessionId, deps.newId, deps.now)
  }

  /** Read what an earlier load of this tab saved (revisions, ratings, what was unsent). */
  async load(): Promise<void> {
    await this.book.load()
    this.refresh()
  }

  private refresh(): void {
    this.state.set({ observations: this.book.all() })
  }

  applyAssign(next: Assignment): void {
    this.state.set((s) => ({ assignment: applyAssignment(s.assignment, next) }))
  }

  /** The seat is no longer an evaluator's: drop the plan material. */
  clearAssignment(): void {
    this.state.set({ assignment: undefined })
  }

  end(): void {
    this.state.set({ ended: true })
  }

  /** Forget everything this device holds for the session (a later visit, or Forget this device). */
  async discard(): Promise<void> {
    await this.book.clear()
    this.state.set({ assignment: undefined, observations: [], dismissedRows: new Set() })
  }

  dismissRow(rowId: string): void {
    this.state.set((s) => ({ dismissedRows: new Set([...s.dismissedRows, rowId]) }))
  }

  /** Saved frames leave in the order they were made, even within one millisecond. */
  private stamp(): number {
    this.lastCreatedAt = Math.max(this.deps.now(), this.lastCreatedAt + 1)
    return this.lastCreatedAt
  }

  /** Save a rating or note here at once, then queue it for the controller. */
  async save(input: ObservationInput): Promise<SaveResult> {
    if (this.state.get().ended) return { ok: false, reason: 'ended' }
    const result = await this.book.save(input)
    if (!result.ok) return result
    this.refresh()
    const o = result.observation
    await this.deps.enqueue({
      id: `eval:${o.observationId}:${o.revision}`,
      payload: { ...toPayload(o) },
      createdAt: this.stamp(),
    })
    return result
  }

  /** The connection took a frame: the form can say "sent". */
  async markSent(observationId: string, revision: number): Promise<void> {
    await this.book.markSent(observationId, revision)
    this.refresh()
  }
}

/** Observations still waiting to be taken by the connection. */
export const pendingCount = (observations: readonly LocalObservation[]): number =>
  observations.filter((o) => o.sentRevision < o.revision).length
