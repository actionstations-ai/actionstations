/**
 * Decision-point votes of a running session (spec 0414): open, take ballots, tally, close,
 * reopen. One vote is open at a time. The map from a device to its ballot lives in memory only,
 * is used for dedupe and for changing a vote, and is dropped two minutes after the vote closes
 * (the reopen window). The log carries the ballots without a device reference; in a by-role
 * vote it carries the role, folded to "other" under `k` devices.
 */
import { randomBytes } from 'node:crypto'
import type { Destination, VoteCastPayload } from '@shared/live/schemas'
import { RESERVED_ROLE_IDS } from '@shared/live/schemas'
import type { SessionLogInput, VoteDefinition, VoteView } from '@shared/schemas/live'
import { AppError } from '../lib/errors'
import { seatDestinations, type DeliverySeat } from './releases'
import {
  OTHER_ROLE,
  decisionText,
  foldedRole,
  tally,
  type Ballot,
  type TallyOption,
  type TallyResult,
} from './vote-tally'

/** How long after closing a vote can be reopened, and its ballots are kept. */
export const REOPEN_WINDOW_MS = 120_000
/** Longest gap between tally updates sent to the projector and to devices. */
export const TALLY_BATCH_MS = 250

export interface VoteSeat extends DeliverySeat {
  online: boolean
}

export interface VoteDeps {
  send: (
    type: 'vote.open' | 'vote.close' | 'controller.notice',
    to: Destination,
    payload: Record<string, unknown>,
  ) => Promise<unknown>
  log: { append: (input: SessionLogInput) => Promise<unknown> }
  seats: () => VoteSeat[]
  roleLabel: (roleId: string) => string
  now: () => number
  changed: () => void
  /** Exercise clock as "H:MM", for the recorded decision. */
  exerciseTime: () => Promise<string>
  /** Called once when a vote closes, with its final result (branching listens here). */
  onClosed?: (result: VoteResult) => void
  timers?: {
    set: (fn: () => void, ms: number) => unknown
    clear: (handle: unknown) => void
  }
}

/** What a closed vote decided, for listeners such as scenario branching. */
export interface VoteResult {
  voteId: string
  rowId?: string
  /** The branch decision this vote answered, when it was opened for one (spec 0430). */
  decisionId?: string
  status: 'closed' | 'interrupted'
  options: { id: string; label: string; count: number }[]
  voted: number
  eligible: number
  /** Option ids with the most votes (more than one on a tie, none when nobody voted). */
  leaders: string[]
}

type Closed = Exclude<VoteView['status'], 'open'>

interface Frozen {
  result: TallyResult
  eligible: number
  rationales: { optionId: string; text: string }[]
  byRole: NonNullable<VoteView['byRole']> | undefined
}

interface Tracked {
  voteId: string
  rowId?: string
  decisionId?: string
  def: VoteDefinition
  options: TallyOption[]
  openedAt: number
  closedAt?: number
  closedClock?: string
  closesAt?: number
  status: VoteView['status']
  /** Device id to ballot. Memory only. */
  ballots: Map<string, Ballot>
  frozen?: Frozen
  recorded: boolean
  closeTimer?: unknown
  discardTimer?: unknown
  /** Tally updates waiting to go out. */
  dirty: boolean
  batchTimer?: unknown
}

const EVALUATORS: Destination = `role:${RESERVED_ROLE_IDS[0]}`
const OBSERVERS: Destination = `role:${RESERVED_ROLE_IDS[1]}`

const newVoteId = (): string => randomBytes(16).toString('base64url')

const isVoter = (s: VoteSeat): boolean => s.kind === 'player'

export function inScope(seat: VoteSeat, targets: readonly string[]): boolean {
  if (!isVoter(seat)) return false
  if (targets.includes('all')) return true
  const mine = seatDestinations(seat)
  return targets.some((t) => mine.has(t))
}

export class Votes {
  private readonly votes: Tracked[] = []
  private readonly timers: NonNullable<VoteDeps['timers']>

  constructor(private readonly deps: VoteDeps) {
    this.timers = deps.timers ?? {
      set: (fn, ms) => setTimeout(fn, ms),
      clear: (h) => clearTimeout(h as NodeJS.Timeout),
    }
  }

  private open_(): Tracked | undefined {
    return this.votes.find((v) => v.status === 'open')
  }

  private need(voteId: string): Tracked {
    const t = this.votes.find((v) => v.voteId === voteId)
    if (!t) throw new AppError('NOT_FOUND', 'No such vote in this session')
    return t
  }

  private voters(t: Tracked): VoteSeat[] {
    return this.deps.seats().filter((s) => inScope(s, t.def.targets))
  }

  private eligible(t: Tracked): number {
    if (t.frozen) return t.frozen.eligible
    return Math.max(this.voters(t).filter((s) => s.online).length, t.ballots.size)
  }

  /** Devices in scope per role: connected now, or having voted. */
  private devicesByRole(t: Tracked): Map<string, number> {
    const out = new Map<string, number>()
    const counted = new Set<string>()
    for (const s of this.voters(t)) {
      if (!s.roleId || !(s.online || t.ballots.has(s.clientId))) continue
      counted.add(s.clientId)
      out.set(s.roleId, (out.get(s.roleId) ?? 0) + 1)
    }
    return out
  }

  /** Roles in scope with fewer than `k` devices (the warning before a by-role vote). */
  scope(
    targets: string[],
    k: number,
  ): { eligible: number; small: { roleId: string; devices: number }[] } {
    const seats = this.deps.seats().filter((s) => s.online && inScope(s, targets))
    const byRole = new Map<string, number>()
    for (const s of seats) if (s.roleId) byRole.set(s.roleId, (byRole.get(s.roleId) ?? 0) + 1)
    const small = [...byRole]
      .filter(([, n]) => n < k)
      .map(([roleId, devices]) => ({ roleId, devices }))
    return { eligible: seats.length, small }
  }

  /** Open a vote. Refuses while another is open. */
  async open(def: VoteDefinition, opts: { rowId?: string } = {}): Promise<VoteView> {
    if (this.open_()) {
      throw new AppError('CONFLICT', 'A vote is already open. Close it before opening another.')
    }
    const now = this.deps.now()
    const ids = def.optionIds?.length === def.options.length ? def.optionIds : undefined
    const options = def.options.map((label, i) => ({ id: ids?.[i] ?? `o${i + 1}`, label }))
    const t: Tracked = {
      voteId: newVoteId(),
      ...(opts.rowId ? { rowId: opts.rowId } : {}),
      ...(def.decisionId ? { decisionId: def.decisionId } : {}),
      def,
      options,
      openedAt: now,
      ...(def.durationSec ? { closesAt: now + def.durationSec * 1000 } : {}),
      status: 'open',
      ballots: new Map(),
      recorded: false,
      dirty: false,
    }
    this.votes.push(t)
    await this.deps.log.append({
      kind: 'vote.open',
      actor: { kind: 'controller' },
      ref: { voteId: t.voteId, ...(t.rowId ? { rowId: t.rowId } : {}) },
      data: {
        question: def.question,
        options,
        anonymous: def.anonymous,
        targets: def.targets,
        allowChange: def.allowChange,
        ...(t.closesAt ? { closesAt: t.closesAt } : {}),
        ...(t.rowId ? { mselRowId: t.rowId } : {}),
        ...(t.decisionId ? { decisionId: t.decisionId } : {}),
        k: def.k,
      },
    })
    await this.sendOpen(t, false)
    await this.noticeOutOfScope(t)
    if (t.closesAt) this.armCountdown(t)
    this.deps.changed()
    return this.view(t)
  }

  private openPayload(t: Tracked, withTally: boolean): Record<string, unknown> {
    return {
      voteId: t.voteId,
      question: t.def.question,
      options: t.options,
      anonymous: t.def.anonymous,
      allowChange: t.def.allowChange,
      ...(t.closesAt ? { closesAt: t.closesAt } : {}),
      targets: t.def.targets.slice(0, 64),
      ...(t.def.rationalePrompt ? { rationalePrompt: t.def.rationalePrompt } : {}),
      ...(t.rowId ? { mselRowId: t.rowId } : {}),
      ...(withTally && t.def.liveResults ? { tally: this.counts(t) } : {}),
    }
  }

  private async sendOpen(t: Tracked, withTally: boolean): Promise<void> {
    const payload = this.openPayload(t, withTally)
    for (const to of t.def.targets) await this.deps.send('vote.open', to as Destination, payload)
  }

  /** Evaluators, observers and players outside the scope see "Vote in progress", no ballot. */
  private async noticeOutOfScope(t: Tracked): Promise<void> {
    if (t.def.targets.includes('all')) return
    const outside = this.deps.seats().filter((s) => s.online && !inScope(s, t.def.targets))
    const to: Destination[] = [
      EVALUATORS,
      OBSERVERS,
      ...outside.filter(isVoter).map((s) => `client:${s.clientId}` as Destination),
    ]
    for (const dest of to) {
      await this.deps.send('controller.notice', dest, {
        noticeId: newVoteId(),
        kind: 'text',
        ref: t.voteId,
        level: 'info',
        text: 'Vote in progress',
        targets: [dest],
        dismissible: true,
      })
    }
  }

  private armCountdown(t: Tracked): void {
    if (t.closeTimer) this.timers.clear(t.closeTimer)
    const ms = Math.max(0, (t.closesAt ?? 0) - this.deps.now())
    t.closeTimer = this.timers.set(() => void this.close(t.voteId, 'countdown').catch(() => {}), ms)
  }

  private counts(t: Tracked): { optionId: string; count: number }[] {
    return this.tallyOf(t).counts
  }

  private tallyOf(t: Tracked): TallyResult {
    if (t.frozen) return t.frozen.result
    return tally({
      options: t.options,
      ballots: [...t.ballots.values()],
      devicesByRole: this.devicesByRole(t),
      k: t.def.k,
      byRole: !t.def.anonymous,
    })
  }

  /** A ballot from a device. Never throws for a bad ballot: it is dropped and counted. */
  async onBallot(from: string, seq: number, p: VoteCastPayload): Promise<'recorded' | 'ignored'> {
    const t = this.votes.find((v) => v.voteId === p.voteId)
    const seat = this.deps.seats().find((s) => s.clientId === from)
    if (!t) return this.anomaly('vote unknown', p.voteId)
    if (t.status !== 'open') return this.anomaly('vote late', p.voteId)
    if (!seat || !seat.online || !inScope(seat, t.def.targets)) {
      return this.anomaly('vote out of scope', p.voteId)
    }
    if (!t.options.some((o) => o.id === p.optionId))
      return this.anomaly('vote bad option', p.voteId)
    const before = t.ballots.get(from)
    if (before && (!t.def.allowChange || seq <= before.seq)) return 'ignored'
    const ballot = this.ballotOf(t, seat, p, seq)
    t.ballots.set(from, ballot)
    await this.logBallot(t, ballot, before)
    this.touch(t)
    return 'recorded'
  }

  private ballotOf(t: Tracked, seat: VoteSeat, p: VoteCastPayload, seq: number): Ballot {
    const rationale = t.def.rationalePrompt ? p.rationale?.trim() : undefined
    return {
      optionId: p.optionId,
      ...(!t.def.anonymous && seat.roleId ? { roleId: seat.roleId } : {}),
      at: this.deps.now(),
      seq,
      ...(rationale ? { rationale } : {}),
    }
  }

  private async anomaly(what: string, voteId: string): Promise<'ignored'> {
    // No device reference: a ballot is never linked to a device, not even a refused one.
    await this.deps.log.append({
      kind: 'anomaly',
      actor: { kind: 'system' },
      ref: { voteId: /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(voteId) ? voteId : 'invalid' },
      data: { what },
    })
    return 'ignored'
  }

  private async logBallot(t: Tracked, b: Ballot, before: Ballot | undefined): Promise<void> {
    const role = b.roleId ? foldedRole(b.roleId, this.devicesByRole(t), t.def.k) : undefined
    await this.deps.log.append({
      kind: 'vote.cast',
      actor: { kind: 'client' },
      ref: { voteId: t.voteId },
      data: {
        voteId: t.voteId,
        optionId: b.optionId,
        ...(before ? { changedFrom: before.optionId } : {}),
        ...(role ? { role } : {}),
      },
    })
    if (b.rationale) {
      await this.deps.log.append({
        kind: 'vote.rationale',
        actor: { kind: 'client' },
        ref: { voteId: t.voteId },
        data: { voteId: t.voteId, optionId: b.optionId, text: b.rationale },
      })
    }
  }

  /** Batch tally updates for the projector and the devices (NFR-4: at most 4 a second). */
  private touch(t: Tracked): void {
    t.dirty = true
    if (t.batchTimer) return
    t.batchTimer = this.timers.set(() => {
      t.batchTimer = undefined
      if (!t.dirty || t.status !== 'open') return
      t.dirty = false
      this.deps.changed()
      if (t.def.liveResults) void this.sendOpen(t, true).catch(() => {})
    }, TALLY_BATCH_MS)
  }

  async close(
    voteId: string,
    reason: 'facilitator' | 'countdown' | 'interrupted' = 'facilitator',
  ): Promise<VoteView> {
    const t = this.need(voteId)
    if (t.status !== 'open') return this.view(t)
    this.clearTimers(t)
    const status: Closed = reason === 'interrupted' ? 'interrupted' : 'closed'
    const result = this.tallyOf(t)
    const eligible = this.eligible(t)
    t.frozen = {
      result,
      eligible,
      rationales: [...t.ballots.values()].flatMap((b) =>
        b.rationale ? [{ optionId: b.optionId, text: b.rationale }] : [],
      ),
      byRole: this.roleView(result),
    }
    t.status = status
    t.closedAt = this.deps.now()
    t.closedClock = await this.deps.exerciseTime().catch(() => undefined)
    await this.deps.log.append({
      kind: 'vote.close',
      actor: { kind: 'controller' },
      ref: { voteId },
      data: {
        voteId,
        status,
        reason,
        results: result.counts,
        voted: result.voted,
        eligible,
        ...(result.byRole ? { byRole: result.byRole } : {}),
      },
    })
    await this.deps
      .send('vote.close', 'all', {
        voteId,
        status,
        results: result.counts,
        voted: result.voted,
        eligible,
        ...(result.byRole ? { byRole: result.byRole } : {}),
        reveal: true,
      })
      .catch(() => undefined)
    t.discardTimer = this.timers.set(() => this.discard(t), REOPEN_WINDOW_MS)
    this.deps.changed()
    this.deps.onClosed?.(this.resultOf(t))
    return this.view(t)
  }

  private clearTimers(t: Tracked): void {
    for (const h of [t.closeTimer, t.batchTimer]) if (h) this.timers.clear(h)
    t.closeTimer = undefined
    t.batchTimer = undefined
  }

  /** The ballots go; the tally stays. */
  private discard(t: Tracked): void {
    t.ballots.clear()
    t.discardTimer = undefined
    this.deps.changed()
  }

  /** Open a vote again within two minutes of closing it, with its ballots (logged). */
  async reopen(voteId: string): Promise<VoteView> {
    const t = this.need(voteId)
    if (!this.canReopen(t)) {
      throw new AppError('CONFLICT', 'This vote can no longer be reopened.')
    }
    if (t.discardTimer) this.timers.clear(t.discardTimer)
    t.discardTimer = undefined
    t.frozen = undefined
    t.status = 'open'
    delete t.closedAt
    delete t.closedClock
    delete t.closesAt
    await this.deps.log.append({
      kind: 'vote.reopen',
      actor: { kind: 'controller' },
      ref: { voteId },
      data: { voteId },
    })
    await this.sendOpen(t, true)
    this.deps.changed()
    return this.view(t)
  }

  private canReopen(t: Tracked): boolean {
    return (
      t.status === 'closed' &&
      !this.open_() &&
      t.closedAt !== undefined &&
      this.deps.now() - t.closedAt <= REOPEN_WINDOW_MS &&
      t.discardTimer !== undefined
    )
  }

  /** Close whatever is open as interrupted (session ends, or a crashed session is replayed). */
  async closeInterrupted(): Promise<void> {
    const t = this.open_()
    if (t) await this.close(t.voteId, 'interrupted')
  }

  private roleView(r: TallyResult): VoteView['byRole'] {
    if (!r.byRole) return undefined
    return r.byRole.map((x) => ({
      roleId: x.roleId,
      label: x.roleId === OTHER_ROLE ? 'Other' : this.deps.roleLabel(x.roleId),
      optionId: x.optionId,
      count: x.count,
    }))
  }

  private resultOf(t: Tracked): VoteResult {
    const r = this.tallyOf(t)
    const top = Math.max(0, ...r.counts.map((c) => c.count))
    return {
      voteId: t.voteId,
      ...(t.rowId ? { rowId: t.rowId } : {}),
      ...(t.decisionId ? { decisionId: t.decisionId } : {}),
      status: t.status === 'interrupted' ? 'interrupted' : 'closed',
      options: t.options.map((o) => ({
        ...o,
        count: r.counts.find((c) => c.optionId === o.id)?.count ?? 0,
      })),
      voted: r.voted,
      eligible: this.eligible(t),
      leaders: top === 0 ? [] : r.counts.filter((c) => c.count === top).map((c) => c.optionId),
    }
  }

  private view(t: Tracked): VoteView {
    const r = this.tallyOf(t)
    const open = t.status === 'open'
    const labels = t.frozen?.rationales ?? []
    const byRole = this.roleView(r)
    return {
      voteId: t.voteId,
      ...(t.rowId ? { rowId: t.rowId } : {}),
      ...(t.decisionId ? { decisionId: t.decisionId } : {}),
      question: t.def.question,
      options: t.options.map((o) => ({
        id: o.id,
        label: o.label,
        count: r.counts.find((c) => c.optionId === o.id)?.count ?? 0,
      })),
      anonymous: t.def.anonymous,
      status: t.status,
      openedAt: t.openedAt,
      ...(t.closedAt ? { closedAt: t.closedAt } : {}),
      ...(t.closedClock ? { closedClock: t.closedClock } : {}),
      ...(t.closesAt ? { closesAt: t.closesAt } : {}),
      voted: r.voted,
      eligible: this.eligible(t),
      ...(byRole ? { byRole } : {}),
      ...(!open && labels.length ? { rationales: labels } : {}),
      liveResults: t.def.liveResults,
      recorded: t.recorded,
      canReopen: this.canReopen(t),
    }
  }

  /** Every vote of the session, newest first, with the text Record as decision would write. */
  async list(): Promise<VoteView[]> {
    const time = await this.deps.exerciseTime()
    return [...this.votes].reverse().map((t) => {
      const v = this.view(t)
      return t.status === 'open'
        ? v
        : {
            ...v,
            decisionText: decisionText(
              t.options,
              v.options.map((o) => ({ optionId: o.id, count: o.count })),
              v.voted,
              time,
            ),
          }
    })
  }

  /** The text for a closed vote's decision, once; marks it recorded and logs `vote.recorded`. */
  async markRecorded(voteId: string, atClock: string): Promise<{ text: string; rowId?: string }> {
    const t = this.need(voteId)
    if (t.status === 'open') throw new AppError('CONFLICT', 'Close the vote before recording it.')
    if (t.recorded) throw new AppError('CONFLICT', 'This vote is already recorded as a decision.')
    const v = this.view(t)
    const text = decisionText(
      t.options,
      v.options.map((o) => ({ optionId: o.id, count: o.count })),
      v.voted,
      atClock,
    )
    t.recorded = true
    await this.deps.log.append({
      kind: 'vote.recorded',
      actor: { kind: 'controller' },
      ref: { voteId, ...(t.rowId ? { rowId: t.rowId } : {}) },
      data: { voteId, ...(t.rowId ? { rowId: t.rowId } : {}) },
    })
    this.deps.changed()
    return { text, ...(t.rowId ? { rowId: t.rowId } : {}) }
  }

  get(voteId: string): VoteView {
    return this.view(this.need(voteId))
  }

  /** Stop every timer (the session ended). */
  dispose(): void {
    for (const t of this.votes) {
      this.clearTimers(t)
      if (t.discardTimer) this.timers.clear(t.discardTimer)
      t.ballots.clear()
    }
  }
}
