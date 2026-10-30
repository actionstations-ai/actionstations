/**
 * Released injects of a running session and their receipts (spec 0412 FR-4, FR-5, FR-9, FR-10):
 * send a release to its targets, copy it to evaluators and observers, take receipts from the
 * devices it was for, resend to more targets, and withdraw. State lives in memory with the
 * session; the log (`inject.release`, `inject.receipt`, `inject.retract`) is the record.
 */
import { createHash } from 'node:crypto'
import type { Destination, InjectReleasePayload } from '@shared/live/schemas'
import { RESERVED_ROLE_IDS } from '@shared/live/schemas'
import type { ClientKind } from '@shared/live/schemas'
import type { ReceiptRow, ReleaseSummary } from '@shared/schemas/live'
import type { SessionLogInput } from '@shared/schemas/live'
import { AppError } from '../lib/errors'

export type ReceiptStatus = 'delivered' | 'read' | 'actioned'

/** A device the controller has seated, as far as delivery cares. */
export interface DeliverySeat {
  clientId: string
  kind: ClientKind
  roleId?: string
  teamId?: string
  /** Role or seat name, never a person's name. */
  label: string
  displayName?: string
}

export interface DeliveryDeps {
  send: (
    type: 'inject.release' | 'inject.recall',
    to: Destination,
    payload: Record<string, unknown>,
    key: 'players' | 'staff',
  ) => Promise<unknown>
  log: { append: (input: SessionLogInput) => Promise<unknown> }
  seats: () => DeliverySeat[]
  clientRef: (clientId: string) => Promise<string>
  now: () => number
  changed: () => void
}

type Times = Partial<Record<ReceiptStatus, number>>

interface Tracked {
  release: InjectReleasePayload
  rowId: string
  targets: Set<Destination>
  expectedAction?: string
  withdrawn: boolean
  receipts: Map<string, Times>
}

const EVALUATORS: Destination = `role:${RESERVED_ROLE_IDS[0]}`
const OBSERVERS: Destination = `role:${RESERVED_ROLE_IDS[1]}`

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

/** The destinations a seat reads as its own. */
export function seatDestinations(seat: DeliverySeat): Set<string> {
  const out = new Set<string>(['all', `client:${seat.clientId}`])
  if (seat.roleId) out.add(`role:${seat.roleId}`)
  if (seat.teamId) out.add(`team:${seat.teamId}`)
  return out
}

const isStaffObserver = (seat: DeliverySeat): boolean =>
  seat.kind === 'evaluator' || seat.kind === 'observer'

export class Delivery {
  private readonly records = new Map<string, Tracked>()

  constructor(private readonly deps: DeliveryDeps) {}

  /** Send a release to its targets and log it. */
  async release(
    payload: InjectReleasePayload,
    opts: { expectedAction?: string } = {},
  ): Promise<ReleaseSummary> {
    const rec: Tracked = {
      release: payload,
      rowId: payload.mselRowId,
      targets: new Set(payload.targets),
      ...(opts.expectedAction ? { expectedAction: opts.expectedAction } : {}),
      withdrawn: false,
      receipts: new Map(),
    }
    this.records.set(payload.releaseId, rec)
    await this.deps.log.append({
      kind: 'inject.release',
      actor: { kind: 'controller' },
      ref: {
        rowId: payload.mselRowId,
        releaseId: payload.releaseId,
        ...(payload.injectId ? { injectId: payload.injectId } : {}),
      },
      data: {
        targets: await this.shown(payload.targets),
        deliveryMode: payload.deliveryMode,
        blobIds: payload.media.map((m) => m.blobId),
        textSha256: sha256(payload.text.body),
        expectsResponse: payload.expectsResponse ?? false,
      },
    })
    await this.sendTo(rec, payload.targets, true)
    this.deps.changed()
    return this.summary(payload.releaseId)
  }

  /** The same release (same id, devices keep one copy) to more targets. */
  async resend(releaseId: string, targets: Destination[]): Promise<ReleaseSummary> {
    const rec = this.need(releaseId)
    if (rec.withdrawn)
      throw new AppError('CONFLICT', 'That inject was withdrawn. Deliver it again.')
    const fresh = targets.filter((t) => !rec.targets.has(t))
    const all = [...rec.targets, ...fresh]
    const release = { ...rec.release, targets: all.slice(0, 64) as InjectReleasePayload['targets'] }
    rec.release = release
    for (const t of fresh) rec.targets.add(t)
    // A resend goes to every named target: a device that missed it needs it again.
    await this.sendTo(rec, targets, false)
    this.deps.changed()
    return this.summary(releaseId)
  }

  /** `inject.recall`: devices hide the item and show it as withdrawn. */
  async retract(releaseId: string): Promise<void> {
    const rec = this.need(releaseId)
    if (rec.withdrawn) return
    rec.withdrawn = true
    const targets = [...new Set([...rec.targets, EVALUATORS, OBSERVERS])]
    for (const to of targets) {
      await this.deps.send(
        'inject.recall',
        to,
        {
          releaseId,
          mselRowId: rec.rowId,
          reason: 'withdrawn',
          text: 'Withdrawn by the facilitator',
          targets: [...rec.targets].slice(0, 64),
        },
        'players',
      )
    }
    await this.deps.log.append({
      kind: 'inject.retract',
      actor: { kind: 'controller' },
      ref: { rowId: rec.rowId, releaseId },
      data: {},
    })
    this.deps.changed()
  }

  /** Whether this session's delivery released `releaseId` itself. */
  has(releaseId: string): boolean {
    return this.records.has(releaseId)
  }

  /** The release for a row that is out and not withdrawn, if any. */
  activeFor(rowId: string): string | undefined {
    for (const [id, rec] of this.records) if (rec.rowId === rowId && !rec.withdrawn) return id
    return undefined
  }

  /** A receipt from a device (sealed to the controller). Returns false when it was refused. */
  async onReceipt(
    from: string,
    seq: number,
    receipt: { releaseId: string; status: ReceiptStatus; at: number },
  ): Promise<boolean> {
    const ref = await this.deps.clientRef(from)
    const rec = this.records.get(receipt.releaseId)
    const seat = this.deps.seats().find((s) => s.clientId === from)
    if (!rec || !seat || !this.mayReceipt(rec, seat)) {
      await this.deps.log.append({
        kind: 'anomaly',
        actor: { kind: 'client', clientRef: ref },
        data: { what: 'receipt rejected', releaseId: receipt.releaseId },
        env: { from: ref, seq },
      })
      return false
    }
    const times = rec.receipts.get(from) ?? {}
    if (times[receipt.status] !== undefined) return true
    times[receipt.status] = this.deps.now()
    rec.receipts.set(from, times)
    await this.deps.log.append({
      kind: 'inject.receipt',
      actor: {
        kind: 'client',
        clientRef: ref,
        seat: { kind: seat.kind, ...(seat.roleId ? { roleId: seat.roleId } : {}) },
        ...(seat.displayName ? { displayName: seat.displayName } : {}),
      },
      ref: { rowId: rec.rowId, releaseId: receipt.releaseId },
      data: { status: receipt.status, deviceAt: receipt.at },
      env: { from: ref, seq },
    })
    this.deps.changed()
    return true
  }

  async summaries(): Promise<ReleaseSummary[]> {
    return Promise.all([...this.records.keys()].map((id) => this.summary(id)))
  }

  /** The log and the UI name a device by its reference, never its client id. */
  private shown(targets: readonly string[]): Promise<string[]> {
    return Promise.all(
      targets.map(async (t) =>
        t.startsWith('client:') ? `client:${await this.deps.clientRef(t.slice(7))}` : t,
      ),
    )
  }

  async summary(releaseId: string): Promise<ReleaseSummary> {
    const rec = this.need(releaseId)
    const seats = this.deps.seats()
    const eligible = seats.filter((s) => !isStaffObserver(s) && this.addressed(rec, s))
    const extra = seats.filter((s) => isStaffObserver(s) && rec.receipts.has(s.clientId))
    const rows: ReceiptRow[] = []
    for (const s of [...eligible, ...extra]) rows.push(await this.row(rec, s))
    const count = (k: ReceiptStatus) =>
      eligible.filter((s) => rec.receipts.get(s.clientId)?.[k]).length
    return {
      releaseId,
      rowId: rec.rowId,
      targets: await this.shown([...rec.targets]),
      withdrawn: rec.withdrawn,
      perClient: rows,
      counts: {
        to: eligible.length,
        delivered: count('delivered'),
        read: count('read'),
        actioned: count('actioned'),
      },
    }
  }

  private async row(rec: Tracked, seat: DeliverySeat): Promise<ReceiptRow> {
    const t = rec.receipts.get(seat.clientId) ?? {}
    return {
      clientRef: (await this.deps.clientRef(seat.clientId)).slice(0, 8),
      seat: seat.label,
      ...(seat.displayName ? { displayName: seat.displayName } : {}),
      ...(t.delivered !== undefined ? { delivered: t.delivered } : {}),
      ...(t.read !== undefined ? { read: t.read } : {}),
      ...(t.actioned !== undefined ? { actioned: t.actioned } : {}),
    }
  }

  private addressed(rec: Tracked, seat: DeliverySeat): boolean {
    const mine = seatDestinations(seat)
    return [...rec.targets].some((t) => mine.has(t))
  }

  private mayReceipt(rec: Tracked, seat: DeliverySeat): boolean {
    return isStaffObserver(seat) || this.addressed(rec, seat)
  }

  private need(releaseId: string): Tracked {
    const rec = this.records.get(releaseId)
    if (!rec) throw new AppError('NOT_FOUND', 'No such release in this session')
    return rec
  }

  /** One frame per target; evaluators and observers get a copy of a first send (FR-5). */
  private async sendTo(rec: Tracked, to: readonly Destination[], copies: boolean): Promise<void> {
    for (const dest of to) {
      await this.deps.send('inject.release', dest, { ...rec.release }, 'players')
    }
    if (!copies) return
    const staff = rec.expectedAction
      ? { ...rec.release, expectedAction: rec.expectedAction }
      : undefined
    if (!rec.targets.has(EVALUATORS)) {
      await this.deps.send(
        'inject.release',
        EVALUATORS,
        staff ?? { ...rec.release },
        staff ? 'staff' : 'players',
      )
    }
    if (!rec.targets.has(OBSERVERS)) {
      await this.deps.send('inject.release', OBSERVERS, { ...rec.release }, 'players')
    }
  }
}
