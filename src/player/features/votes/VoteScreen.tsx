import { useEffect, useState } from 'react'
import type { PlayerSession } from '../../app/session'
import { useStore } from '../../app/store'
import { STRINGS } from '../../app/strings'
import { Result, TallyList } from './Result'
import { mayVote, type PlayerVote } from './votes'

const mmss = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Milliseconds until the vote closes, by the controller's clock; undefined without a countdown. */
function useRemaining(vote: PlayerVote, offsetMs: number): number | undefined {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!vote.closesAt || vote.status !== 'open') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [vote.closesAt, vote.status])
  if (!vote.closesAt || vote.status !== 'open') return undefined
  return vote.closesAt - (now + offsetMs)
}

/** One spoken warning each at 30 s and 10 s; the visible clock is not a live region (NFR-3). */
function CountdownAnnouncer({ remaining }: { remaining: number | undefined }) {
  const band =
    remaining === undefined || remaining <= 0
      ? 0
      : remaining <= 10_500
        ? 10
        : remaining <= 30_500
          ? 30
          : 0
  const spoken =
    band === 10 ? STRINGS.votes.countdown10 : band === 30 ? STRINGS.votes.countdown30 : ''
  return (
    <p className="sr-only" role="status" aria-live="polite">
      {spoken}
    </p>
  )
}

function Ballot({ session, vote }: { session: PlayerSession; vote: PlayerVote }) {
  const [choice, setChoice] = useState(vote.mine ?? '')
  const [why, setWhy] = useState('')
  const locked = !!vote.mine && !vote.allowChange
  const unchanged = choice === vote.mine && why.trim() === ''
  return (
    <form
      className="vote-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (choice) void session.castVote(vote.voteId, choice, why)
      }}
    >
      <fieldset className="vote-options" disabled={locked}>
        <legend className="sr-only">{STRINGS.votes.optionsLegend}</legend>
        {vote.options.map((o) => (
          <label key={o.id} className={`vote-option${choice === o.id ? ' is-chosen' : ''}`}>
            <input
              type="radio"
              name={`vote-${vote.voteId}`}
              value={o.id}
              checked={choice === o.id}
              onChange={() => setChoice(o.id)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>
      {vote.rationalePrompt && !locked ? (
        <div className="field">
          <label className="field__label" htmlFor="vote-why">
            {vote.rationalePrompt || STRINGS.votes.rationaleLabel}
          </label>
          <textarea
            id="vote-why"
            className="field__input"
            rows={3}
            maxLength={280}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
          />
        </div>
      ) : null}
      {locked ? null : (
        <button
          type="submit"
          className="btn btn--primary btn--block"
          disabled={!choice || unchanged}
        >
          {vote.mine ? STRINGS.votes.change : STRINGS.votes.cast}
        </button>
      )}
      {vote.mine ? (
        <p role="status" className="vote-status">
          {vote.ballotSent ? STRINGS.votes.recorded : STRINGS.votes.queued}
        </p>
      ) : null}
      <p className="muted">
        {vote.allowChange ? STRINGS.votes.canChange : STRINGS.votes.cannotChange}{' '}
        {vote.anonymous ? STRINGS.votes.anonymousNote : STRINGS.votes.byRoleNote}
      </p>
    </form>
  )
}

function Closed({ session, vote }: { session: PlayerSession; vote: PlayerVote }) {
  return (
    <>
      <p role="status" className="vote-status">
        {vote.status === 'interrupted' ? STRINGS.votes.interrupted : STRINGS.votes.closed}
      </p>
      {vote.late ? (
        <p className="vote-status" role="alert">
          {STRINGS.votes.late}
        </p>
      ) : !vote.mine ? (
        <p className="muted">{STRINGS.votes.noBallot}</p>
      ) : null}
      <Result session={session} vote={vote} />
    </>
  )
}

/** The vote card: the question, a radio group of options, change until close, then the result. */
export function VoteScreen({
  session,
  voteId,
  onBack,
}: {
  session: PlayerSession
  voteId: string
  onBack: () => void
}) {
  const vote = useStore(session.store, (s) => s.votes[voteId])
  const seat = useStore(session.store, (s) => s.seat)
  const clientId = useStore(session.store, (s) => s.clientId)
  const offset = useStore(session.store, (s) => s.clockOffsetMs)
  const remaining = useRemaining(vote ?? ({ status: 'closed' } as PlayerVote), offset)
  if (!vote) {
    return (
      <section className="screen" aria-labelledby="vote-heading" data-screen="vote">
        <h1 id="vote-heading">{STRINGS.votes.heading}</h1>
        <p className="muted">{STRINGS.votes.none}</p>
        <button type="button" className="btn" onClick={onBack}>
          {STRINGS.votes.back}
        </button>
      </section>
    )
  }
  const view = seat && {
    clientId,
    kind: seat.kind,
    roleId: seat.role?.id,
    teamId: seat.role?.teamId,
  }
  const mayCast = mayVote(vote, view)
  return (
    <section className="screen vote" aria-labelledby="vote-heading" data-screen="vote">
      <div className="screen__head">
        <button type="button" className="btn btn--quiet" onClick={onBack}>
          {STRINGS.votes.back}
        </button>
        <h1 id="vote-heading">{STRINGS.votes.heading}</h1>
        {remaining !== undefined ? (
          <p className="vote__clock">{STRINGS.votes.closesIn(mmss(remaining))}</p>
        ) : null}
      </div>
      <CountdownAnnouncer remaining={remaining} />
      <p className="vote__question">{vote.question}</p>
      {vote.status !== 'open' ? (
        <Closed session={session} vote={vote} />
      ) : mayCast ? (
        <>
          <Ballot key={vote.voteId} session={session} vote={vote} />
          {vote.tally ? (
            <section aria-label={STRINGS.votes.liveTally}>
              <h2 className="h3">{STRINGS.votes.liveTally}</h2>
              <TallyList
                lines={vote.options.map((o) => ({
                  ...o,
                  count: vote.tally?.find((t) => t.optionId === o.id)?.count ?? 0,
                }))}
                voted={vote.tally.reduce((n, t) => n + t.count, 0)}
                mine={vote.mine}
              />
            </section>
          ) : null}
        </>
      ) : (
        <p className="muted">{STRINGS.votes.watching}</p>
      )}
    </section>
  )
}
