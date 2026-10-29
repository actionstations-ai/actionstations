// "Plan seams to test" in the brief (#427, FR-2): the open or confirmed conflicts and missing
// cross-references from the last plan check, as a checkbox group of at most three. Passages
// are rendered as text, never HTML. With no plan check yet, the picker offers to run one.
import { useId } from 'react'
import type { PlanFinding } from '@shared/schemas/plan-conflicts'
import { MAX_SEAMS, passageLine, passageQuote, seamChoices } from '@shared/seams'
import { toast } from '../../components/toast-store'
import { Badge, Button } from '../../components/ui'
import { call } from '../../lib/api'
import { useIpcQuery } from '../../lib/query'
import { isRunning, latestJob, trackJob, useJobsStore } from '../../state/jobs'

function documentsOf(f: PlanFinding): string {
  if (f.kind === 'dangling_reference')
    return `${f.a.documentTitle} points to ${f.missingTarget ?? 'a missing document'}`
  return `${f.a.documentTitle} and ${f.b?.documentTitle ?? f.a.documentTitle}`
}

function Passages({ f }: { f: PlanFinding }) {
  return (
    <details className="seam-picker__passages">
      <summary>
        Show passages<span className="sr-only"> for {f.slotLabel}</span>
      </summary>
      {[f.a, ...(f.b ? [f.b] : [])].map((p, i) => (
        <figure key={i} className="seam-picker__passage">
          <figcaption className="muted">{passageLine(p)}</figcaption>
          <blockquote>{passageQuote(p)}</blockquote>
        </figure>
      ))}
      {f.kind === 'dangling_reference' && (
        <p className="muted">
          {f.missingTarget ?? 'The document it points to'} is not among the project’s documents.
        </p>
      )}
    </details>
  )
}

function SeamOption(props: {
  f: PlanFinding
  checked: boolean
  disabled: boolean
  onToggle: (on: boolean) => void
}) {
  const { f } = props
  return (
    <li className="seam-picker__option">
      <label className="seam-picker__label">
        <input
          type="checkbox"
          checked={props.checked}
          disabled={props.disabled}
          onChange={(e) => props.onToggle(e.target.checked)}
        />
        <span>
          <strong>{f.slotLabel}</strong> <span className="muted">({documentsOf(f)})</span>{' '}
          {f.kind === 'dangling_reference' ? (
            <Badge>missing document</Badge>
          ) : f.verdict === 'unconfirmed' ? (
            <Badge tone="warn">unconfirmed</Badge>
          ) : (
            <Badge tone="info">conflict</Badge>
          )}
        </span>
      </label>
      <Passages f={f} />
    </li>
  )
}

function RunCheck({ projectPath }: { projectPath: string }) {
  const job = useJobsStore((s) =>
    latestJob(s.jobs, (j) => j.kind === 'plan-check' && j.projectPath === projectPath),
  )
  const running = isRunning(job)
  const run = async () => {
    try {
      const { jobId } = await call('plan-check:run', {
        projectPath,
        confirmWithModel: false,
        withinDocument: false,
      })
      trackJob(jobId, { kind: 'plan-check', projectPath })
    } catch (e) {
      toast.error('Could not start the plan check', e)
    }
  }
  return (
    <p className="seam-picker__empty">
      No plan check yet.{' '}
      <Button size="sm" onClick={() => void run()} disabled={running}>
        {running ? 'Checking plans…' : 'Run plan check'}
      </Button>
    </p>
  )
}

function countText(n: number): string {
  if (n >= MAX_SEAMS) return `${n} of ${MAX_SEAMS} selected. You can test at most three seams.`
  return `${n} of ${MAX_SEAMS} selected.`
}

export function SeamPicker(props: {
  projectPath: string
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const legendId = useId()
  const hintId = useId()
  const file = useIpcQuery('plan-check:get', { projectPath: props.projectPath })
  const choices = seamChoices(file.data?.findings ?? [])
  const selected = new Set(props.value)
  const full = selected.size >= MAX_SEAMS
  const toggle = (id: string, on: boolean) =>
    props.onChange(
      on ? [...props.value, id].slice(0, MAX_SEAMS) : props.value.filter((x) => x !== id),
    )
  return (
    <fieldset className="seam-picker" aria-describedby={hintId}>
      <legend id={legendId} className="field__label">
        Plan seams to test
      </legend>
      <p id={hintId} className="field__hint">
        Places where your plans disagree or point to a missing document. The exercise puts players
        there without telling them; only the controller notes name the conflict.
      </p>
      {file.isSuccess && !file.data && <RunCheck projectPath={props.projectPath} />}
      {file.data && !choices.length && (
        <p className="seam-picker__empty muted">No open conflicts between your plans.</p>
      )}
      {choices.length > 0 && (
        <>
          <ul className="seam-picker__list" aria-labelledby={legendId}>
            {choices.map((f) => (
              <SeamOption
                key={f.id}
                f={f}
                checked={selected.has(f.id)}
                disabled={full && !selected.has(f.id)}
                onToggle={(on) => toggle(f.id, on)}
              />
            ))}
          </ul>
          <p className="muted seam-picker__count" role="status" aria-live="polite">
            {countText(selected.size)}
          </p>
        </>
      )}
    </fieldset>
  )
}
