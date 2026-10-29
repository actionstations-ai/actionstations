/**
 * What a device knows about the votes of a session (spec 0414): the question and options from
 * `vote.open`, this device's own choice, and the result from `vote.close`. Pure helpers, so the
 * rules (who may vote, what a repeated `vote.open` means) are tested without a browser.
 */
import type { Opened } from '../../../shared/live/codec'
import type { VoteClosePayload, VoteOpenPayload } from '../../../shared/live/schemas'
import { seatDestinations, type SeatView } from '../../app/items'

export interface PlayerVote {
  voteId: string
  question: string
  options: { id: string; label: string }[]
  anonymous: boolean
  allowChange: boolean
  closesAt?: number
  rationalePrompt?: string
  targets: string[]
  /** Running tally, when the facilitator shows it on devices. */
  tally?: { optionId: string; count: number }[]
  status: 'open' | 'closed' | 'interrupted'
  /** The option this device chose. */
  mine?: string
  /** False while the ballot waits in the outbox (offline). */
  ballotSent: boolean
  /** The vote closed before this device's ballot went out. */
  late: boolean
  result?: Pick<VoteClosePayload, 'results' | 'voted' | 'eligible' | 'byRole'> & {
    revealed: boolean
  }
  /** Exercise-clock arrival, for the banner. */
  openedAt: number
}

export type VoteMap = Readonly<Record<string, PlayerVote>>

/** A player seat in the vote's scope. Observers and evaluators watch; they never get a ballot. */
export function mayVote(vote: Pick<PlayerVote, 'targets'>, seat: SeatView | undefined): boolean {
  if (!seat || (seat.kind && seat.kind !== 'player')) return false
  if (vote.targets.includes('all')) return true
  const mine = seatDestinations(seat)
  return vote.targets.some((t) => mine.has(t))
}

/** Apply a `vote.open`. A repeated id is an update (tally) or a reopen; this device's choice stays. */
export function applyOpen(
  votes: VoteMap,
  msg: Opened<'vote.open'>,
  at: number,
): { votes: VoteMap; isNew: boolean; reopened: boolean } {
  const p: VoteOpenPayload = msg.payload
  const before = votes[p.voteId]
  const next: PlayerVote = {
    voteId: p.voteId,
    question: p.question,
    options: p.options,
    anonymous: p.anonymous,
    allowChange: p.allowChange,
    ...(p.closesAt ? { closesAt: p.closesAt } : {}),
    ...(p.rationalePrompt ? { rationalePrompt: p.rationalePrompt } : {}),
    targets: p.targets,
    ...(p.tally ? { tally: p.tally } : {}),
    status: 'open',
    ...(before?.mine ? { mine: before.mine } : {}),
    ballotSent: before?.ballotSent ?? true,
    late: false,
    openedAt: before?.openedAt ?? at,
  }
  return {
    votes: { ...votes, [p.voteId]: next },
    isNew: !before,
    reopened: !!before && before.status !== 'open',
  }
}

/** Apply a `vote.close`: freeze the result and note a ballot that did not make it in time. */
export function applyClose(votes: VoteMap, msg: Opened<'vote.close'>, at: number): VoteMap {
  const p = msg.payload
  const before = votes[p.voteId]
  const base: PlayerVote = before ?? {
    voteId: p.voteId,
    question: '',
    options: p.results.map((r) => ({ id: r.optionId, label: r.optionId })),
    anonymous: true,
    allowChange: false,
    targets: [],
    status: p.status,
    ballotSent: true,
    late: false,
    openedAt: at,
  }
  const next: PlayerVote = {
    ...base,
    status: p.status,
    late: !!base.mine && !base.ballotSent,
    result: {
      results: p.results,
      voted: p.voted,
      eligible: p.eligible,
      ...(p.byRole ? { byRole: p.byRole } : {}),
      revealed: p.reveal,
    },
  }
  return { ...votes, [p.voteId]: next }
}

/** The vote to show first: the open one, else the most recent. */
export function currentVote(votes: VoteMap): PlayerVote | undefined {
  const all = Object.values(votes)
  return (
    all.filter((v) => v.status === 'open').sort((a, b) => b.openedAt - a.openedAt)[0] ??
    all.sort((a, b) => b.openedAt - a.openedAt)[0]
  )
}

/** Percent of `voted` as a whole number; 0 when nobody voted. */
export function percent(count: number, voted: number): number {
  return voted > 0 ? Math.round((count / voted) * 100) : 0
}
