// "Open vote" on an MSEL decision row (spec 0414 FR-2): one click puts the row's question to
// the whole room with the row's anonymity; the Votes tab has the finer options.
import { voteForDecision } from '@shared/branching/vote-input'
import { VoteDefinition } from '@shared/schemas/live'
import type { MselRow } from '@shared/schemas/scenario'
import { Button } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import { errorText } from '../../../lib/errors'
import { useLiveVotes } from './use-live-votes'
import { VOTES } from './vote-strings'

export function OpenVoteButton(props: { projectPath: string; scenarioId: string; row: MselRow }) {
  const votes = useLiveVotes(props.projectPath, props.scenarioId)
  const decision = props.row.decision
  if (!decision || !votes.active) return null
  const open = votes.votes.find((v) => v.status === 'open')
  const mine = votes.votes.find((v) => v.rowId === props.row.id && v.status === 'open')
  const run = () => {
    const definition = VoteDefinition.parse(voteForDecision(decision))
    votes.open(definition, props.row.id).then(
      () => void toast.success(VOTES.opened),
      (e) => void toast.error('Could not open the vote', new Error(errorText(e))),
    )
  }
  return (
    <div className="row">
      <Button disabled={!!open} onClick={run}>
        Open vote
      </Button>
      {mine ? (
        <span className="muted" role="status">
          {VOTES.voted(mine.voted, mine.eligible)}
        </span>
      ) : open ? (
        <span className="muted">{VOTES.alreadyOpen}</span>
      ) : null}
    </div>
  )
}
