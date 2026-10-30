/**
 * The SimCell helper's side of the page (spec 0406 `simcell.draft` / `simcell.action`, #518): the
 * reply drafts the controller sent to this device and the decisions made on them. The session
 * owns one of these; this class holds no transport. Drafts live in memory only: a reloaded
 * device is sent the waiting ones again when it rejoins.
 */
import type { SimcellDraftPayload } from '../../../shared/live/schemas'
import { Store } from '../../app/store'

/** Drafts shown at once; a controller that floods the device loses the oldest. */
export const MAX_HELPER_DRAFTS = 50

export type HelperAction = 'approve' | 'edit' | 'discard'

export interface HelperDraft {
  draftId: string
  revision: number
  persona: string
  threadLabel: string
  playerMessage?: string
  text: string
  flags: { code: string; message: string }[]
}

export interface HelperState {
  drafts: HelperDraft[]
  /** The session ended: nothing more can be sent. */
  ended: boolean
}

export interface HelperDeps {
  now: () => number
  newId: () => string
  /** Queue one `simcell.action` for the controller. */
  enqueue: (action: {
    id: string
    payload: Record<string, unknown>
    createdAt: number
  }) => Promise<void>
}

export class SimcellHelperFeature {
  readonly state = new Store<HelperState>({ drafts: [], ended: false })
  /** The highest revision seen or decided per draft, so a replayed older frame changes nothing. */
  private readonly seen = new Map<string, number>()
  private lastCreatedAt = 0

  constructor(private readonly deps: HelperDeps) {}

  applyDraft(p: SimcellDraftPayload): void {
    const known = this.seen.get(p.draftId) ?? 0
    if (p.revision <= known) return
    this.seen.set(p.draftId, p.revision)
    const rest = this.state.get().drafts.filter((d) => d.draftId !== p.draftId)
    if (p.status === 'withdrawn') return this.state.set({ drafts: rest })
    const next: HelperDraft = {
      draftId: p.draftId,
      revision: p.revision,
      persona: p.persona,
      threadLabel: p.threadLabel,
      ...(p.playerMessage ? { playerMessage: p.playerMessage } : {}),
      text: p.text,
      flags: p.flags,
    }
    this.state.set({ drafts: [...rest, next].slice(-MAX_HELPER_DRAFTS) })
  }

  /** Approve, edit or discard a draft: the decision is queued for the controller, once. */
  async decide(draftId: string, action: HelperAction, text?: string): Promise<boolean> {
    const draft = this.state.get().drafts.find((d) => d.draftId === draftId)
    if (!draft || this.state.get().ended) return false
    if (action === 'edit' && !text?.trim()) return false
    // Gone from the list at once: a second tap cannot send a second decision.
    this.state.set({ drafts: this.state.get().drafts.filter((d) => d.draftId !== draftId) })
    const createdAt = Math.max(this.deps.now(), this.lastCreatedAt + 1)
    this.lastCreatedAt = createdAt
    await this.deps.enqueue({
      id: this.deps.newId(),
      createdAt,
      payload: {
        draftId,
        revision: draft.revision,
        action,
        ...(action === 'edit' ? { text } : {}),
      },
    })
    return true
  }

  /** This seat is no longer a SimCell helper's: drop the drafts. */
  clear(): void {
    this.state.set({ drafts: [] })
  }

  end(): void {
    this.state.set({ ended: true })
  }
}

/** Stands in for the helper's state on a seat that is not a SimCell helper's. */
export const NO_HELPER_STATE = new Store<HelperState>({ drafts: [], ended: false })
