// Change the status of one or several corrective actions (FR-5). The rules are the shared ones
// main enforces: a note for deferred and cancelled, a verification for verified.
import { useState } from 'react'
import { drillEvidenceFor, evidenceNote, suggestedResult } from '@shared/program/drill-evidence'
import { statusChangeProblem } from '@shared/program/status'
import {
  CORRECTIVE_ACTION_STATUSES,
  CORRECTIVE_ACTION_STATUS_LABELS,
  type CorrectiveActionStatus,
  type CorrectiveActionVerification,
  type PlanSectionRef,
} from '@shared/schemas'
import { Button, Dialog, Field } from '../../components/ui'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { refreshProgramQueries } from '../../state/program'

export function StatusDialog(props: {
  programPath: string
  ids: string[]
  current?: CorrectiveActionStatus
  /** The plan sections of the action (one action only): micro-drill runs on them can be evidence. */
  planSections?: readonly PlanSectionRef[]
  onClose: (changedTo?: CorrectiveActionStatus) => void
}) {
  const choices = CORRECTIVE_ACTION_STATUSES.filter((s) => s !== props.current)
  const [to, setTo] = useState<CorrectiveActionStatus>(choices[0] ?? 'open')
  const [note, setNote] = useState('')
  const [method, setMethod] = useState<'exercise' | 'drill' | 'review'>('exercise')
  const [result, setResult] = useState<'pass' | 'partial' | 'fail'>('pass')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [evidenceKey, setEvidenceKey] = useState('')
  const snapshots = useIpcQuery(
    'program:snapshots',
    { programPath: props.programPath },
    { enabled: to === 'verified' && !!props.planSections?.length },
  )
  const evidence = drillEvidenceFor(props.planSections ?? [], snapshots.data ?? [])
  const chosen = evidence.find((e) => e.run.runId === evidenceKey)
  const pickEvidence = (runId: string) => {
    setEvidenceKey(runId)
    const found = evidence.find((e) => e.run.runId === runId)
    if (!found) return
    setMethod('review')
    setResult(suggestedResult(found.run.coverage))
    setNote(evidenceNote(found))
    setError('')
  }
  const verification = (): CorrectiveActionVerification | undefined =>
    to === 'verified'
      ? {
          method,
          result,
          at: new Date().toISOString(),
          note: note.trim(),
          ...(chosen ? { projectId: chosen.projectId } : {}),
        }
      : undefined

  const submit = async () => {
    const v = verification()
    const problem = statusChangeProblem(props.current ?? 'open', to, note, v)
    if (problem && !(props.current === undefined && problem.includes('already')))
      return setError(problem)
    setBusy(true)
    try {
      await call('program:action-status', {
        programPath: props.programPath,
        ids: props.ids,
        to,
        note: note.trim(),
        ...(v ? { verification: v } : {}),
      })
      await refreshProgramQueries()
      props.onClose(to)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const noteLabel =
    to === 'verified'
      ? 'Where was it observed working? (project and scenario, or the review)'
      : to === 'deferred' || to === 'cancelled'
        ? 'Why? (required)'
        : 'Note (optional)'
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && props.onClose()}
      title={
        props.ids.length > 1 ? `Change status of ${props.ids.length} actions` : 'Change status'
      }
      footer={
        <>
          <Button onClick={() => props.onClose()}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>
            Save status
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field label="New status">
          {({ id }) => (
            <select
              id={id}
              className="select"
              value={to}
              onChange={(e) => {
                setTo(e.target.value as CorrectiveActionStatus)
                setError('')
              }}
            >
              {choices.map((s) => (
                <option key={s} value={s}>
                  {CORRECTIVE_ACTION_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          )}
        </Field>
        {to === 'verified' && (
          <div className="row program-form-row">
            <Field label="How was it checked?">
              {({ id }) => (
                <select
                  id={id}
                  className="select"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as typeof method)}
                >
                  <option value="exercise">Observed in an exercise</option>
                  <option value="drill">A drill</option>
                  <option value="review">A review</option>
                </select>
              )}
            </Field>
            <Field label="Result">
              {({ id }) => (
                <select
                  id={id}
                  className="select"
                  value={result}
                  onChange={(e) => setResult(e.target.value as typeof result)}
                >
                  <option value="pass">Passed</option>
                  <option value="partial">Partly</option>
                  <option value="fail">Failed</option>
                </select>
              )}
            </Field>
          </div>
        )}
        {to === 'verified' && evidence.length > 0 && (
          <Field
            label="Use a short drill as evidence"
            hint="Drills on a plan section this action cites. Only totals are kept, never answers or names."
          >
            {({ id, describedBy }) => (
              <select
                id={id}
                className="select"
                aria-describedby={describedBy}
                value={evidenceKey}
                onChange={(e) => pickEvidence(e.target.value)}
              >
                <option value="">No drill</option>
                {evidence.map((e) => (
                  <option key={e.run.runId} value={e.run.runId}>
                    {e.run.at.slice(0, 10)}: {e.run.planSection.headingPath} (
                    {Math.round(e.run.coverage * 100)}% covered, {e.run.participants} people)
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field label={noteLabel} {...(error ? { error } : {})}>
          {({ id, describedBy, invalid }) => (
            <textarea
              id={id}
              className="textarea"
              value={note}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => {
                setNote(e.target.value)
                setError('')
              }}
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}
