// "Propose next exercise" (FR-10): the ranked list with its reasons, and the way to start a
// scenario from it. Only the constraint sentences go into the scenario brief; owner names and
// emails stay in the program folder.
import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { ExerciseProposal, ProposalItem } from '@shared/schemas'
import { Button, Dialog } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { projectKey } from '../../state/project'
import type { ProgramContext } from './ProgramFrame'

function Ranked(props: { title: string; items: ProposalItem[] }) {
  if (!props.items.length) return null
  return (
    <section aria-label={props.title}>
      <h3>{props.title}</h3>
      <ol className="program-ranked">
        {props.items.slice(0, 5).map((i) => (
          <li key={i.key}>
            <strong>{i.label}</strong> <span className="muted">score {i.score}</span>
            <ul>
              {i.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  )
}

export interface ProposalState {
  constraints: string[]
  correctiveActionIds: string[]
}

function StartDialog(props: {
  ctx: ProgramContext
  proposal: ExerciseProposal
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { program, projectPaths } = props.ctx.summary
  const linked = program.projects.filter((l) => projectPaths[l.projectId])
  const [projectId, setProjectId] = useState(linked[0]?.projectId ?? '')
  const start = async () => {
    const path = projectPaths[projectId]
    if (!path) return
    try {
      await call('project:open', { path })
      const state: ProposalState = {
        constraints: props.proposal.suggestedConstraints,
        correctiveActionIds: props.proposal.correctiveActionIds,
      }
      navigate(`/p/${projectKey(path)}/generate`, { state: { programProposal: state } })
    } catch (e) {
      toast.error('Could not open the project', e)
    }
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => !o && props.onClose()}
      title="Start a scenario from this proposal"
      description="The brief gets these sentences as constraints. Owner names and emails are not included. You review the brief before anything is sent to a model."
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" disabled={!projectId} onClick={() => void start()}>
            Open the brief
          </Button>
        </>
      }
    >
      {linked.length === 0 ? (
        <p>Link a project to the program first. The scenario is built inside a project.</p>
      ) : (
        <div className="stack">
          <div className="field">
            <label className="field__label" htmlFor="proposal-project">
              Project
            </label>
            <select
              id="proposal-project"
              className="select"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {linked.map((l) => (
                <option key={l.projectId} value={l.projectId}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <ul className="program-constraints">
            {props.proposal.suggestedConstraints.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  )
}

export function ProposalCard({ ctx }: { ctx: ProgramContext }) {
  const proposal = useIpcQuery('program:propose', { programPath: ctx.programPath })
  const [starting, setStarting] = useState(false)
  const data = proposal.data
  const copy = async () => {
    if (!data) return
    try {
      await navigator.clipboard.writeText(data.suggestedConstraints.join('\n'))
      toast.success('Constraints copied')
    } catch (e) {
      toast.error('Could not copy', e)
    }
  }
  return (
    <section className="card program-proposal" aria-labelledby="program-propose">
      <h2 id="program-propose">Propose next exercise</h2>
      <p className="muted">
        Ranked from open corrective actions, how long ago each capability and plan section was
        exercised, and the cycle priorities. The same program always gives the same list.
      </p>
      {proposal.isError && (
        <p className="field__error" role="alert">
          {errorText(proposal.error)}
        </p>
      )}
      {data && data.capabilities.length === 0 && data.planSections.length === 0 && (
        <p>
          Nothing to rank yet. Link a project, or add corrective actions and priorities, and the
          proposal fills in.
        </p>
      )}
      {data && (
        <>
          <Ranked title="Core Capabilities" items={data.capabilities} />
          <Ranked title="Plan sections" items={data.planSections} />
          {data.suggestedConstraints.length > 0 && (
            <div className="row">
              <Button variant="primary" onClick={() => setStarting(true)}>
                Start a scenario from this proposal
              </Button>
              <Button onClick={() => void copy()}>Copy constraints</Button>
            </div>
          )}
          <StartDialog
            ctx={ctx}
            proposal={data}
            open={starting}
            onClose={() => setStarting(false)}
          />
        </>
      )}
    </section>
  )
}
