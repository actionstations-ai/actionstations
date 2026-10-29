// The Votes tab of Facilitate (spec 0414 FR-9): open a vote, watch the tally come in, show it on
// the projector, close, reopen within two minutes, and record the result as a decision.
import { Monitor } from 'lucide-react'
import type { FacilitatorState } from '@shared/ipc/facilitator'
import type { VoteView } from '@shared/schemas/live'
import type { Scenario } from '@shared/schemas/scenario'
import { Badge, Button } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import { errorText } from '../../../lib/errors'
import type { UpdateState } from '../use-delivery-actions'
import { TallyBars } from './TallyBars'
import { useLiveVotes, type LiveVotes } from './use-live-votes'
import { VoteForm } from './VoteForm'
import { VOTES } from './vote-strings'

const fail = (title: string) => (e: unknown) => toast.error(title, new Error(errorText(e)))

function Reasons({ vote }: { vote: VoteView }) {
  if (!vote.rationales?.length) return null
  return (
    <details className="fac-votes__reasons">
      <summary>{VOTES.reasons}</summary>
      {vote.options.map((o) => {
        const mine = vote.rationales!.filter((r) => r.optionId === o.id)
        return mine.length ? (
          <section key={o.id}>
            <h4 className="fac-panel__subtitle">{o.label}</h4>
            <ul>
              {mine.map((r, i) => (
                <li key={i}>{r.text}</li>
              ))}
            </ul>
          </section>
        ) : null
      })}
    </details>
  )
}

function Actions(props: { vote: VoteView; votes: LiveVotes; update: UpdateState }) {
  const { vote, votes, update } = props
  const record = () =>
    votes
      .record(vote.voteId)
      .then((d) => update((s: FacilitatorState) => ({ ...s, decisions: [...s.decisions, d] })))
      .catch(fail('Could not record the decision'))
  return (
    <div className="row">
      <Button
        size="sm"
        onClick={() => void votes.show(vote.voteId).catch(fail('Could not show the vote'))}
      >
        <Monitor size={16} aria-hidden /> {VOTES.show}
      </Button>
      {vote.status === 'open' ? (
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            if (window.confirm(VOTES.closeConfirm))
              void votes.close(vote.voteId).catch(fail('Could not close the vote'))
          }}
        >
          {VOTES.close}
        </Button>
      ) : (
        <>
          {vote.canReopen && (
            <Button
              size="sm"
              onClick={() =>
                void votes.reopen(vote.voteId).catch(fail('Could not reopen the vote'))
              }
            >
              {VOTES.reopen}
            </Button>
          )}
          {vote.recorded ? (
            <Badge tone="ok">{VOTES.recorded}</Badge>
          ) : (
            <Button size="sm" onClick={() => void record()}>
              {VOTES.record(vote.rowId)}
            </Button>
          )}
        </>
      )}
    </div>
  )
}

function VoteCard(props: { vote: VoteView; votes: LiveVotes; update: UpdateState }) {
  const { vote } = props
  return (
    <article className="fac-votes__card" aria-label={`Vote: ${vote.question}`}>
      <header className="fac-votes__head">
        <strong>
          {vote.rowId ? `${vote.rowId} · ` : ''}
          {vote.question}
        </strong>
        <span role="status">
          {VOTES.state[vote.status]} · {VOTES.voted(vote.voted, vote.eligible)}
        </span>
      </header>
      <TallyBars view={vote} />
      <Actions {...props} />
      <Reasons vote={vote} />
    </article>
  )
}

export function VotePanel(props: { projectPath: string; scenario: Scenario; update: UpdateState }) {
  const votes = useLiveVotes(props.projectPath, props.scenario.id)
  if (!votes.active) {
    return (
      <div className="fac-votes">
        <h2 className="live-heading">{VOTES.heading}</h2>
        <p className="muted">{VOTES.needSession}</p>
      </div>
    )
  }
  const hasOpen = votes.votes.some((v) => v.status === 'open')
  return (
    <div className="fac-votes">
      <h2 className="live-heading">{VOTES.heading}</h2>
      <VoteForm
        projectPath={props.projectPath}
        scenario={props.scenario}
        disabledReason={hasOpen ? VOTES.alreadyOpen : undefined}
        onOpen={(def, rowId) =>
          votes.open(def, rowId).then(
            () => void toast.success(VOTES.opened),
            (e) => fail('Could not open the vote')(e),
          )
        }
      />
      <section aria-labelledby="fac-votes-history">
        <h3 id="fac-votes-history" className="fac-panel__subtitle">
          {VOTES.history}
        </h3>
        {votes.votes.length === 0 ? (
          <p className="muted">{VOTES.empty}</p>
        ) : (
          votes.votes.map((v) => (
            <VoteCard key={v.voteId} vote={v} votes={votes} update={props.update} />
          ))
        )}
      </section>
    </div>
  )
}
