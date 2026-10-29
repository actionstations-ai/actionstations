// Plan conflicts on the Documents page (#423, FR-10 to FR-14): run the plan check, see when it
// last ran and what it found, and work through the findings: two passages side by side with
// the value highlighted, the model's verdict when there is one, and Open passage, Not a
// conflict, Confirmed and Copy for plan owner. Passages are rendered as text, never HTML.
import { useId, useState } from 'react'
import type { PlanFinding, PlanPassage } from '@shared/schemas/plan-conflicts'
import type { DocumentMeta } from '@shared/schemas/project'
import { Term } from '../../components/Glossary'
import { toast } from '../../components/toast-store'
import { Badge, Button } from '../../components/ui'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { queryClient, useIpcQuery } from '../../lib/query'
import { isRunning, latestJob, trackJob, useJobsStore } from '../../state/jobs'
import {
  FILTER_LABEL,
  VERDICT_TEXT,
  copyText,
  filterCounts,
  highlight,
  passageLine,
  visibleFindings,
  type ConflictFilter,
} from './plan-conflicts-model'

const PLAN_KINDS = new Set(['plan', 'policy', 'form'])
const OFFER_KEY = 'plan-check-offer-dismissed:'

export interface OpenPassage {
  (documentId: string, chunkId: number): void
}

function Passage(props: {
  label: string
  p: PlanPassage
  value?: string | undefined
  onOpen: OpenPassage
}) {
  const [before, mark, after] = highlight(props.p.span, props.value)
  return (
    <div className="plan-finding__passage">
      <h4>
        {props.label}: {props.p.documentTitle}
      </h4>
      <p className="muted">{passageLine(props.p)}</p>
      <blockquote>
        {before}
        {mark && <mark>{mark}</mark>}
        {after}
      </blockquote>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => props.onOpen(props.p.documentId, props.p.chunkId)}
      >
        Open passage<span className="sr-only"> {props.label}</span>
      </Button>
    </div>
  )
}

function useStatus(projectPath: string) {
  return async (f: PlanFinding, status: 'open' | 'dismissed' | 'confirmed', note?: string) => {
    try {
      await call('plan-check:set-status', {
        projectPath,
        findingId: f.id,
        status,
        ...(note !== undefined ? { note } : {}),
      })
      void queryClient.invalidateQueries({ queryKey: ['plan-check:get'] })
    } catch (e) {
      toast.error('Could not save the decision', e)
    }
  }
}

function FindingActions(props: { f: PlanFinding; projectPath: string }) {
  const { f } = props
  const setStatus = useStatus(props.projectPath)
  const noteId = useId()
  const [note, setNote] = useState(f.note ?? '')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText(f))
      toast.success('Copied for the plan owner')
    } catch (e) {
      toast.error('Could not copy', e)
    }
  }
  return (
    <div className="plan-finding__actions">
      <label htmlFor={noteId} className="field__label">
        Note (optional)
      </label>
      <input
        id={noteId}
        className="input"
        value={note}
        maxLength={1000}
        onChange={(e) => setNote(e.target.value)}
      />
      {f.status !== 'dismissed' && (
        <Button size="sm" onClick={() => void setStatus(f, 'dismissed', note)}>
          Not a conflict
        </Button>
      )}
      {f.status !== 'confirmed' && f.kind === 'contradiction' && (
        <Button size="sm" onClick={() => void setStatus(f, 'confirmed', note)}>
          Confirmed
        </Button>
      )}
      {(f.status === 'dismissed' || f.status === 'confirmed') && (
        <Button size="sm" variant="ghost" onClick={() => void setStatus(f, 'open', note)}>
          Reopen
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => void copy()}>
        Copy for plan owner
      </Button>
    </div>
  )
}

const STATUS_TONE = {
  open: 'warn',
  dismissed: 'neutral',
  confirmed: 'error',
  outdated: 'neutral',
} as const
const STATUS_TEXT = {
  open: 'Open',
  dismissed: 'Not a conflict',
  confirmed: 'Confirmed',
  outdated: 'Outdated',
}

function Finding(props: { f: PlanFinding; projectPath: string; onOpen: OpenPassage }) {
  const { f } = props
  const headingId = useId()
  return (
    <li className="card plan-finding" aria-labelledby={headingId} data-testid="plan-finding">
      <div className="plan-finding__top">
        <h3 id={headingId}>
          {f.slotLabel}
          {f.kind === 'dangling_reference'
            ? `: ${f.missingTarget ?? f.subject}`
            : f.slotLabel.includes(f.subject) || f.slot === 'release_approver'
              ? ''
              : `: ${f.subject}`}
        </h3>
        <Badge tone={STATUS_TONE[f.status]}>{STATUS_TEXT[f.status]}</Badge>
      </div>
      {f.values && (
        <p>
          One plan says “{f.values[0]}”, the other “{f.values[1]}”.
        </p>
      )}
      <div className="plan-finding__passages">
        <Passage label="Passage A" p={f.a} value={f.values?.[0]} onOpen={props.onOpen} />
        {f.b && <Passage label="Passage B" p={f.b} value={f.values?.[1]} onOpen={props.onOpen} />}
      </div>
      {f.kind === 'contradiction' && <p className="muted">{VERDICT_TEXT[f.verdict]}</p>}
      {f.explanation && <p>{f.explanation}</p>}
      {f.note && <p className="muted">Note: {f.note}</p>}
      {f.status !== 'outdated' ? (
        <FindingActions f={f} projectPath={props.projectPath} />
      ) : (
        <p className="muted">A passage changed or was removed since this was found.</p>
      )}
    </li>
  )
}

function RunControls(props: { projectPath: string; docs: DocumentMeta[]; running: boolean }) {
  const defaults = useIpcQuery('plan-check:defaults', { projectPath: props.projectPath })
  const [confirm, setConfirm] = useState<boolean | null>(null)
  const [within, setWithin] = useState(false)
  const useModel = confirm ?? defaults.data?.confirmWithModel ?? false
  const run = async () => {
    try {
      const { jobId } = await call('plan-check:run', {
        projectPath: props.projectPath,
        confirmWithModel: useModel,
        withinDocument: within,
      })
      trackJob(jobId, { kind: 'plan-check', projectPath: props.projectPath })
    } catch (e) {
      toast.error('Could not start the plan check', e)
    }
  }
  const plans = props.docs.filter((d) => PLAN_KINDS.has(d.kind)).length
  return (
    <div className="plan-conflicts__controls">
      <label className="plan-conflicts__check">
        <input type="checkbox" checked={useModel} onChange={(e) => setConfirm(e.target.checked)} />
        <span>Confirm each conflict with the model</span>
      </label>
      {defaults.data && <p className="field__hint">{defaults.data.reason}</p>}
      <label className="plan-conflicts__check">
        <input type="checkbox" checked={within} onChange={(e) => setWithin(e.target.checked)} />
        <span>Also compare sections within one document</span>
      </label>
      <Button variant="primary" onClick={() => void run()} disabled={props.running || plans < 1}>
        {props.running ? 'Checking plans…' : 'Check plans for conflicts'}
      </Button>
    </div>
  )
}

function readOffer(projectPath: string): boolean {
  try {
    return localStorage.getItem(OFFER_KEY + projectPath) === '1'
  } catch {
    return false
  }
}

/** Offered once when the project has two plans and no check ran yet (FR-10). */
function FirstRunOffer(props: { projectPath: string; plans: number; onRun: () => void }) {
  const [dismissed, setDismissed] = useState(() => readOffer(props.projectPath))
  if (dismissed || props.plans < 2) return null
  const hide = () => {
    try {
      localStorage.setItem(OFFER_KEY + props.projectPath, '1')
    } catch {
      // Private storage: the offer just comes back next time.
    }
    setDismissed(true)
  }
  return (
    <div className="card plan-conflicts__offer" role="note">
      <p>
        This project has {props.plans} plans. The plan check lists places where they disagree, such
        as two different approvers for public releases.
      </p>
      <Button size="sm" onClick={props.onRun}>
        Check them now
      </Button>{' '}
      <Button size="sm" variant="ghost" onClick={hide}>
        Not now
      </Button>
    </div>
  )
}

export function PlanConflicts(props: {
  projectPath: string
  docs: DocumentMeta[]
  onOpen: OpenPassage
}) {
  const { projectPath } = props
  const file = useIpcQuery('plan-check:get', { projectPath })
  const jobs = useJobsStore((s) => s.jobs)
  const job = latestJob(jobs, (j) => j.kind === 'plan-check' && j.projectPath === projectPath)
  const running = isRunning(job)
  const [filter, setFilter] = useState<ConflictFilter>('open')
  const filterId = useId()
  const counts = filterCounts(file.data)
  const shown = visibleFindings(file.data, filter)
  const plans = props.docs.filter((d) => PLAN_KINDS.has(d.kind) && d.status === 'ok').length
  const runNow = async () => {
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
    <section className="plan-conflicts" aria-labelledby="plan-conflicts-title">
      <h2 id="plan-conflicts-title">
        <Term id="planConflict">Plan conflicts</Term>
      </h2>
      <p className="muted">
        Compares your plans, policies and forms and lists where they disagree, with both passages.
        Matching runs on this computer; the model check is optional.
      </p>
      {file.isError && (
        <p className="field__error" role="alert">
          Could not read the last plan check: {errorText(file.error)}
        </p>
      )}
      {file.isSuccess && !file.data && !running && (
        <FirstRunOffer projectPath={projectPath} plans={plans} onRun={() => void runNow()} />
      )}
      <RunControls projectPath={projectPath} docs={props.docs} running={running} />
      <p role="status" className="muted">
        {running
          ? `Checking plans… ${job?.message ?? ''}`
          : file.data
            ? `Last checked ${new Date(file.data.checkedAt).toLocaleString()}: ${counts.open} open, ${counts.confirmed} confirmed, ${counts.dismissed} not a conflict.${file.data.stats ? ` ${file.data.stats.candidates} candidate(s), ${file.data.stats.sent} sent to the model, ${file.data.stats.skipped} skipped.` : ''}`
            : 'Not checked yet.'}
      </p>
      {file.data && (
        <>
          <div className="row">
            <label htmlFor={filterId} className="field__label">
              Show
            </label>
            <select
              id={filterId}
              className="select plan-conflicts__filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value as ConflictFilter)}
            >
              {(Object.keys(FILTER_LABEL) as ConflictFilter[]).map((k) => (
                <option key={k} value={k}>
                  {FILTER_LABEL[k]} ({counts[k]})
                </option>
              ))}
            </select>
          </div>
          {shown.length ? (
            <ul className="stack plan-conflicts__list" aria-label="Plan findings">
              {shown.map((f) => (
                <Finding key={f.id} f={f} projectPath={projectPath} onOpen={props.onOpen} />
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing to show for this filter.</p>
          )}
        </>
      )}
    </section>
  )
}
