/**
 * SimCell helper devices in a live session (spec 0406 `simcell.draft` / `simcell.action`, #518).
 * A facilitator can turn on helper devices: a trusted colleague on a phone or tablet in the
 * SimCell seat who reads each drafted reply and approves, edits or discards it. The controller
 * still owns every send: a helper's decision becomes the same `resolve` call the facilitator's
 * own buttons make, so the log, the persona clock and the player's view are the same.
 *
 * Least privilege:
 *   - drafts go only to seats the controller seated as `simcell` AND proved to hold the staff key,
 *     one frame each, sealed with the staff key to that `client:<id>`; a player never receives one;
 *   - a draft with no thread yet (the controller must choose who gets it) or a voice-call turn is
 *     never offered, so a helper cannot pick recipients or ring a phone;
 *   - an action is applied only when the device is a proven SimCell seat, helpers are on, the draft
 *     was offered to that device, and the revision matches; anything else is logged and ignored;
 *   - the wire draft id is random per offer and means nothing outside the session.
 */
import { randomBytes } from 'node:crypto'
import type { Destination, SimcellActionPayload, SimcellDraftPayload } from '@shared/live/schemas'
import type { SimcellDraft } from '@shared/schemas'
import type { SessionLogInput } from '@shared/schemas/live'

export interface HelperSeat {
  clientId: string
  kind: string
  /** Proven holder of the staff key. */
  staff: boolean
  online: boolean
}

export interface HelperDeps {
  send: (to: Destination, payload: Record<string, unknown>) => Promise<unknown>
  log: { append: (input: SessionLogInput) => Promise<unknown> }
  seats: () => HelperSeat[]
  seatOf: (clientId: string) => HelperSeat | undefined
  clientRef: (clientId: string) => Promise<string>
  /** Queued drafts, with the thread's and persona's names for display. */
  queued: () => Promise<{ draft: SimcellDraft; persona: string; threadLabel: string }[]>
  /** The facilitator's own approve, edit or discard. */
  resolve: (req: {
    draftId: string
    action: 'send' | 'edit' | 'discard'
    text?: string
  }) => Promise<unknown>
  changed: () => void
  /** Staff seats are closed (a partner invite is out and not granted): no helper decision applies. */
  locked?: () => boolean
}

interface Offer {
  /** The queue's own id for the draft; never sent. */
  draftId: string
  revision: number
  devices: Set<string>
}

/** Drafts a helper may hold at once; the oldest wait for the facilitator. */
export const MAX_OFFERED = 20

const SEND_DRAFT = 'unassigned'

export class LiveSimcellHelpers {
  private on = false
  /** Wire id (random, per offer) to offer. */
  private readonly offers = new Map<string, Offer>()
  private chain: Promise<void> = Promise.resolve()

  constructor(private readonly deps: HelperDeps) {}

  get enabled(): boolean {
    return this.on
  }

  /** Online devices that may receive drafts. */
  helperCount(): number {
    return this.helpers().length
  }

  async setEnabled(on: boolean): Promise<void> {
    this.on = on
    await this.sync()
    this.deps.changed()
  }

  /** Offer what is waiting to a device that just joined or came back. */
  async onJoin(): Promise<void> {
    await this.sync()
  }

  /** Bring every helper in line with the queue: new drafts out, settled drafts withdrawn. */
  sync(): Promise<void> {
    this.chain = this.chain.then(() => this.syncNow()).catch(() => undefined)
    return this.chain
  }

  private helpers(): HelperSeat[] {
    return this.deps.seats().filter((s) => s.kind === 'simcell' && s.staff && s.online)
  }

  private async syncNow(): Promise<void> {
    const queued = this.on ? await this.deps.queued() : []
    const eligible = queued
      .filter(({ draft }) => draft.threadId !== SEND_DRAFT && !draft.callId)
      .slice(0, MAX_OFFERED)
    await this.withdrawSettled(new Set(eligible.map((q) => q.draft.id)))
    for (const q of eligible) await this.offerTo(q)
  }

  private wireIdOf(draftId: string): string | undefined {
    for (const [wire, offer] of this.offers) if (offer.draftId === draftId) return wire
    return undefined
  }

  private async offerTo(q: { draft: SimcellDraft; persona: string; threadLabel: string }) {
    let wire = this.wireIdOf(q.draft.id)
    if (!wire) {
      wire = randomBytes(16).toString('base64url')
      this.offers.set(wire, { draftId: q.draft.id, revision: 1, devices: new Set() })
    }
    const offer = this.offers.get(wire)!
    for (const seat of this.helpers()) {
      if (offer.devices.has(seat.clientId)) continue
      offer.devices.add(seat.clientId)
      await this.deps.send(`client:${seat.clientId}`, draftPayload(wire, offer.revision, q))
    }
  }

  private async withdrawSettled(live: Set<string>): Promise<void> {
    for (const [wire, offer] of [...this.offers]) {
      if (live.has(offer.draftId)) continue
      this.offers.delete(wire)
      for (const clientId of offer.devices) {
        if (!this.deps.seatOf(clientId)?.online) continue
        await this.deps.send(`client:${clientId}`, {
          draftId: wire,
          revision: offer.revision + 1,
          status: 'withdrawn',
          persona: '-',
          threadLabel: '-',
          text: '-',
          flags: [],
        })
      }
    }
  }

  /** A helper's decision. Returns whether it was applied. */
  async onAction(from: string, seq: number, p: SimcellActionPayload): Promise<boolean> {
    const ref = await this.deps.clientRef(from)
    const reject = async (why: string) => {
      await this.deps.log.append({
        kind: 'anomaly',
        actor: { kind: 'client', clientRef: ref },
        data: { what: 'simcell action rejected', why },
        env: { from: ref, seq },
      })
      return false
    }
    const seat = this.deps.seatOf(from)
    if (!seat || seat.kind !== 'simcell' || !seat.staff) return reject('not a SimCell seat')
    if (!this.on) return reject('helper devices are off')
    if (this.deps.locked?.()) return reject('staff seats are closed')
    const offer = this.offers.get(p.draftId)
    if (!offer || !offer.devices.has(from)) return reject('draft not offered')
    if (p.revision !== offer.revision) return reject('stale revision')
    // Consumed before the send: a replay of the same frame finds nothing.
    this.offers.delete(p.draftId)
    await this.deps.resolve({
      draftId: offer.draftId,
      action: p.action === 'approve' ? 'send' : p.action,
      ...(p.action === 'edit' ? { text: p.text ?? '' } : {}),
    })
    await this.deps.log.append({
      kind: 'simcell.draft',
      actor: { kind: 'client', clientRef: ref, seat: { kind: 'simcell' } },
      data: { event: 'helper_action', action: p.action, draftId: offer.draftId },
      env: { from: ref, seq },
    })
    this.deps.changed()
    return true
  }
}

function draftPayload(
  wire: string,
  revision: number,
  q: { draft: SimcellDraft; persona: string; threadLabel: string },
): SimcellDraftPayload {
  return {
    draftId: wire,
    revision,
    status: 'queued',
    persona: q.persona.slice(0, 120),
    threadLabel: q.threadLabel.slice(0, 120),
    ...(q.draft.inReplyToText ? { playerMessage: q.draft.inReplyToText.slice(0, 4000) } : {}),
    text: q.draft.text.slice(0, 4000),
    flags: q.draft.flags.slice(0, 10).map((f) => ({
      code: f.code,
      message: f.message.slice(0, 200),
    })),
  }
}
