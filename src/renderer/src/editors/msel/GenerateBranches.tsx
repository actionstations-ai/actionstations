// "Generate branch rows" for one decision (spec 0430 FR-11). The model drafts rows for each
// option; they are shown for review and nothing changes until the designer applies them. Applying
// replaces the unlocked rows of those branches in the draft, so it saves and undoes like any
// other MSEL edit.
import { useId, useState } from 'react'
import { BranchPlanResult } from '@shared/branching/proposal'
import { Button } from '../../components/ui'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useJob } from '../../routes/generate/use-job'
import { applyBranchPlan } from './branch-ops'
import type { Draft } from './model'
import type { RegionalView } from './owner'

export interface GenerateBranchesProps {
  projectPath: string
  scenarioId: string
  /** The draft has edits that are not saved yet: the job reads the saved scenario. */
  dirty: boolean
  draft: Draft
  edit: (next: Draft) => void
  decisionRowId: string
  /** Rows another organization owns are never replaced (#497). */
  regional?: RegionalView | undefined
}

function PlanReview(props: { plan: BranchPlanResult; onApply: () => void; onDiscard: () => void }) {
  const { plan } = props
  return (
    <div className="branches__plan" role="group" aria-label="Drafted branch rows">
      <p>
        Drafted {plan.branches.reduce((n, b) => n + b.rows.length, 0)} rows. Applying replaces the
        unlocked rows of these branches.
      </p>
      <ul>
        {plan.branches.map((b) => (
          <li key={b.branchId}>
            <strong>
              {b.branchId.toUpperCase()}: {b.label}
            </strong>
            <ul>
              {b.rows.map((r) => (
                <li key={r.id}>
                  {r.id} at {r.time}: {r.event}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {[...plan.notes, ...plan.warnings].length > 0 && (
        <ul aria-label="Notes on the drafted rows" className="muted">
          {[...plan.notes, ...plan.warnings].map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <div className="row">
        <Button size="sm" variant="primary" onClick={props.onApply}>
          Apply to the branches
        </Button>
        <Button size="sm" variant="ghost" onClick={props.onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  )
}

export function GenerateBranches(props: GenerateBranchesProps) {
  const [jobId, setJobId] = useState<string | null>(null)
  const [plan, setPlan] = useState<BranchPlanResult>()
  const [error, setError] = useState<string>()
  const statusId = useId()

  const job = useJob(jobId, (e) => {
    setJobId(null)
    if (e.status !== 'done') return setError(e.error ?? 'The model did not finish')
    const parsed = BranchPlanResult.safeParse(e.result)
    if (parsed.success) setPlan(parsed.data)
    else setError('The drafted rows could not be read')
  })

  const start = async () => {
    setError(undefined)
    setPlan(undefined)
    try {
      const r = await call('generate:branch-plan', {
        projectPath: props.projectPath,
        scenarioId: props.scenarioId,
        decisionRowId: props.decisionRowId,
      })
      setJobId(r.jobId)
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <div className="branches__generate">
      <Button
        size="sm"
        disabled={!!jobId || props.dirty}
        aria-describedby={statusId}
        onClick={() => void start()}
      >
        Generate branch rows
      </Button>
      <span id={statusId} role="status" className="muted">
        {props.dirty && 'Waiting for your edits to save.'}
        {jobId && (job?.message || 'Asking the model…')}
      </span>
      {error && (
        <p role="alert" className="field__error">
          {error}
        </p>
      )}
      {plan && (
        <PlanReview
          plan={plan}
          onDiscard={() => setPlan(undefined)}
          onApply={() => {
            props.edit(applyBranchPlan(props.draft, plan, props.regional))
            setPlan(undefined)
          }}
        />
      )}
    </div>
  )
}
