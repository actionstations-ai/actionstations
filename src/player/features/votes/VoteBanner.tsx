import type { PlayerSession } from '../../app/session'
import { useStore } from '../../app/store'
import { STRINGS } from '../../app/strings'
import { currentVote, mayVote } from './votes'

/**
 * A line under the header while a vote is open: a button for a seat that may vote, a plain
 * "Vote in progress" for evaluators, observers and seats outside the vote's scope (FR-3).
 */
export function VoteBanner({
  session,
  onOpen,
  viewing,
}: {
  session: PlayerSession
  onOpen: (voteId: string) => void
  /** The vote the screen already shows; its banner would only repeat it. */
  viewing?: string | undefined
}) {
  const votes = useStore(session.store, (s) => s.votes)
  const seat = useStore(session.store, (s) => s.seat)
  const clientId = useStore(session.store, (s) => s.clientId)
  const vote = currentVote(votes)
  if (!vote || vote.status !== 'open' || !seat || vote.voteId === viewing) return null
  const view = { clientId, kind: seat.kind, roleId: seat.role?.id, teamId: seat.role?.teamId }
  if (!mayVote(vote, view)) {
    return (
      <p className="vote-banner vote-banner--quiet" role="status">
        {STRINGS.votes.bannerWatching}
      </p>
    )
  }
  return (
    <div className="vote-banner">
      <button
        type="button"
        className="btn btn--primary btn--block"
        onClick={() => onOpen(vote.voteId)}
      >
        {vote.mine ? STRINGS.votes.bannerReview : STRINGS.votes.bannerOpen}: {vote.question}
      </button>
    </div>
  )
}
