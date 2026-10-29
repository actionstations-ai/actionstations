// "Propose next inject" (spec 0430 FR-10): ask the model for one more row in a thin branch and
// review it here. Nothing is delivered or saved until the facilitator accepts the row; the
// verdict is recorded either way. The model proposes, a person decides.
import { useId, useState } from 'react'
import type { ActivePath } from '@shared/branching/active-path'
import { ProposalResult } from '@shared/branching/proposal'
import type { BranchingLogInput, FacilitatorState } from '@shared/ipc/facilitator'
import type { MselRow, Scenario } from '@shared/schemas/scenario'
import { Button } from '../../components/ui'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { queryClient } from '../../lib/query'
import { toast } from '../../components/toast-store'
import { useJob } from '../generate/use-job'
import { playableBranches } from './branching'
import { exerciseStamp } from './clock'
import type { UpdateState } from './use-delivery-actions'

interface Props {
  projectPath: string
  scenario: Scenario
  path: ActivePath | undefined
  update: UpdateState
  minutes: number
  onLog: (entries: BranchingLogInput[]) => void
  onAnnounce: (text: string) => void
}

function verdictState(
  s: FacilitatorState,
  hash: string,
  verdict: 'accepted' | 'rejected',
  rowId: string | undefined,
): FacilitatorState {
  const b = s.branching
  return {
    ...s,
    branching: {
      ...(b?.seed ? { seed: b.seed } : {}),
      decisions: b?.decisions ?? [],
      proposals: [
        ...(b?.proposals ?? []),
        { hash, ...(rowId ? { rowId } : {}), verdict, at: new Date().toISOString() },
      ],
    },
  }
}

function ProposalCard(props: {
  result: ProposalResult
  onAccept: () => void
  onReject: () => void
}) {
  const r = props.result.row
  return (
    <article className="fac-proposal" aria-label="Proposed inject">
      <h4>
        Proposed: {r.id} at {r.time}
      </h4>
      <p>
        <strong>From {r.from}.</strong> {r.event}
      </p>
      <p>
        <strong>Expected action:</strong> {r.expectedAction}
      </p>
      <p className="muted">Nothing is delivered until you accept it.</p>
      <div className="fac-decision__buttons">
        <Button variant="primary" onClick={props.onAccept}>
          Accept and add to the branch
        </Button>
        <Button onClick={props.onReject}>Reject</Button>
      </div>
    </article>
  )
}

export function ProposeInject(props: Props) {
  const { scenario } = props
  const branches = playableBranches(scenario, props.path)
  const [branchId, setBranchId] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [proposal, setProposal] = useState<ProposalResult>()
  const [error, setError] = useState<string>()
  const selectId = useId()
  const chosen = branches.find((b) => b.id === branchId)?.id ?? branches[0]?.id

  const job = useJob(jobId, (e) => {
    setJobId(null)
    if (e.status !== 'done') return setError(e.error ?? 'The proposal did not finish')
    const parsed = ProposalResult.safeParse(e.result)
    if (!parsed.success) return setError('The proposal could not be read')
    setProposal(parsed.data)
    props.onLog([
      {
        kind: 'proposal.offer',
        ex: exerciseStamp(props.minutes),
        data: { hash: parsed.data.hash, branchId: parsed.data.row.branchId ?? '' },
      },
    ])
  })

  const start = async () => {
    if (!chosen) return
    setError(undefined)
    setProposal(undefined)
    try {
      const r = await call('generate:propose-inject', {
        projectPath: props.projectPath,
        scenarioId: scenario.id,
        branchId: chosen,
      })
      setJobId(r.jobId)
    } catch (e) {
      setError(errorText(e))
    }
  }

  const reject = () => {
    if (!proposal) return
    props.update((s) => verdictState(s, proposal.hash, 'rejected', undefined))
    props.onLog([
      { kind: 'proposal.reject', ex: exerciseStamp(props.minutes), data: { hash: proposal.hash } },
    ])
    setProposal(undefined)
    props.onAnnounce('Proposal rejected')
  }

  const accept = async () => {
    if (!proposal) return
    const row: MselRow = proposal.row
    try {
      await call('scenarios:save', {
        projectPath: props.projectPath,
        scenario: { ...scenario, msel: [...scenario.msel, row] },
        note: `Accepted proposed inject ${row.id}`,
        baseUpdatedAt: scenario.updatedAt,
      })
      void queryClient.invalidateQueries({ queryKey: ['scenarios:get'] })
      props.update((s) => verdictState(s, proposal.hash, 'accepted', row.id))
      props.onLog([
        {
          kind: 'proposal.accept',
          ex: exerciseStamp(props.minutes),
          rowId: row.id,
          data: { hash: proposal.hash, rowId: row.id },
        },
      ])
      setProposal(undefined)
      props.onAnnounce(`${row.id} added to the branch`)
    } catch (e) {
      toast.error('Could not add the proposed inject', errorText(e))
    }
  }

  if (!branches.length) return null
  return (
    <section className="fac-propose" aria-label="Propose next inject">
      <div className="row">
        <label htmlFor={selectId}>Branch</label>
        <select
          id={selectId}
          className="select"
          value={chosen}
          onChange={(e) => setBranchId(e.target.value)}
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.id.toUpperCase()}: {b.label}
            </option>
          ))}
        </select>
        <Button disabled={!!jobId} onClick={() => void start()}>
          Propose next inject
        </Button>
      </div>
      {job && jobId && <p role="status">{job.message || 'Asking the model…'}</p>}
      {error && (
        <p role="alert" className="field__error">
          {error}
        </p>
      )}
      {proposal && (
        <ProposalCard result={proposal} onAccept={() => void accept()} onReject={reject} />
      )}
    </section>
  )
}
