// One corrective action: view and edit its fields, change its status, read its history. A save
// carries the revision it was edited from; if someone else saved first, both versions are shown.
import { useState } from 'react'
import { actionLabel } from '@shared/program/status'
import {
  CAPABILITY_ELEMENTS,
  CAPABILITY_ELEMENT_LABELS,
  CORRECTIVE_ACTION_STATUS_LABELS,
  type CorrectiveActionView,
  type ProgramAction,
} from '@shared/schemas'
import { Badge, Button, Dialog, Field } from '../../components/ui'
import { call, type IpcError } from '../../lib/api'
import { errorText, isConflictError } from '../../lib/errors'
import { refreshProgramQueries } from '../../state/program'
import { CapabilityPicker } from './CapabilityPicker'
import { StatusDialog } from './StatusDialog'

const theirsOf = (e: unknown): CorrectiveActionView | undefined =>
  (e as IpcError | undefined)?.details
    ? ((e as IpcError).details as { theirs?: CorrectiveActionView }).theirs
    : undefined

function History({ action }: { action: ProgramAction }) {
  if (!action.history.length) return null
  return (
    <section aria-label="Status history">
      <h3>History ({action.history.length})</h3>
      <ol className="program-history">
        {action.history.map((h) => (
          <li key={h.at + h.to}>
            {new Date(h.at).toLocaleDateString()}:{' '}
            {h.from ? `${CORRECTIVE_ACTION_STATUS_LABELS[h.from]} to ` : ''}
            {CORRECTIVE_ACTION_STATUS_LABELS[h.to]}
            {h.note ? ` (${h.note})` : ''}
          </li>
        ))}
      </ol>
      {action.verifications.length > 0 && (
        <>
          <h3>Verifications ({action.verifications.length})</h3>
          <ul>
            {action.verifications.map((v) => (
              <li key={v.at}>
                {v.method}, {v.result}, {new Date(v.at).toLocaleDateString()}
                {v.note ? `: ${v.note}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

export function ActionDrawer(props: {
  programPath: string
  initial: CorrectiveActionView | { action: ProgramAction; revision: undefined }
  isNew: boolean
  onClose: () => void
}) {
  const [action, setAction] = useState<ProgramAction>(props.initial.action)
  const [revision, setRevision] = useState(props.initial.revision)
  const [theirs, setTheirs] = useState<CorrectiveActionView>()
  const [error, setError] = useState('')
  const [statusOpen, setStatusOpen] = useState(false)
  const [announce, setAnnounce] = useState('')
  const set = <K extends keyof ProgramAction>(key: K, value: ProgramAction[K]) =>
    setAction((a) => ({ ...a, [key]: value }))
  const owner = (key: 'name' | 'organization' | 'email', value: string) =>
    setAction((a) => ({ ...a, owner: { ...a.owner, [key]: value } }))

  const save = async (baseRevision = revision) => {
    if (!action.title.trim()) return setError('Give the corrective action a title.')
    try {
      const saved = await call('program:action-save', {
        programPath: props.programPath,
        action,
        ...(baseRevision ? { baseRevision } : {}),
      })
      await refreshProgramQueries()
      setAction(saved.action)
      setRevision(saved.revision)
      props.onClose()
    } catch (e) {
      if (isConflictError(e) && theirsOf(e)) setTheirs(theirsOf(e))
      else setError(errorText(e))
    }
  }

  if (theirs)
    return (
      <Dialog
        open
        onOpenChange={(o) => !o && props.onClose()}
        title="Someone else changed this action"
        description={`${actionLabel(theirs.action)} was saved by another person or computer after you opened it. Their title is "${theirs.action.title}". Choose which version to keep.`}
        footer={
          <>
            <Button
              onClick={() => {
                setAction(theirs.action)
                setRevision(theirs.revision)
                setTheirs(undefined)
              }}
            >
              Use their version
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const base = theirs.revision
                setTheirs(undefined)
                void save(base)
              }}
            >
              Keep mine
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    )

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && props.onClose()}
      title={props.isNew ? 'New corrective action' : `${actionLabel(action)}: edit`}
      className="program-drawer"
      footer={
        <>
          <Button onClick={props.onClose}>Close</Button>
          <Button variant="primary" onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="stack">
        {!props.isNew && (
          <div className="row">
            <Badge tone={action.status === 'verified' ? 'ok' : 'info'}>
              {CORRECTIVE_ACTION_STATUS_LABELS[action.status]}
            </Badge>
            <Button size="sm" onClick={() => setStatusOpen(true)}>
              Change status…
            </Button>
            <span className="sr-only" role="status">
              {announce}
            </span>
          </div>
        )}
        <Field label="Title">
          {({ id }) => (
            <input
              id={id}
              className="input"
              value={action.title}
              onChange={(e) => set('title', e.target.value)}
            />
          )}
        </Field>
        <Field label="Description">
          {({ id }) => (
            <textarea
              id={id}
              className="textarea"
              value={action.description}
              onChange={(e) => set('description', e.target.value)}
            />
          )}
        </Field>
        <Field label="Area for improvement it answers">
          {({ id }) => (
            <textarea
              id={id}
              className="textarea"
              value={action.areaForImprovement}
              onChange={(e) => set('areaForImprovement', e.target.value)}
            />
          )}
        </Field>
        <CapabilityPicker
          legend="Core Capabilities"
          value={action.coreCapabilities}
          onChange={(v) => set('coreCapabilities', v)}
        />
        {action.planSections.length > 0 && (
          <section aria-label="Plan sections">
            <h3>Plan sections</h3>
            <ul>
              {action.planSections.map((s) => (
                <li key={s.documentId + s.headingPath}>{s.headingPath || s.documentTitle}</li>
              ))}
            </ul>
          </section>
        )}
        <div className="row program-form-row">
          <Field label="Owner">
            {({ id }) => (
              <input
                id={id}
                className="input"
                value={action.owner.name}
                onChange={(e) => owner('name', e.target.value)}
              />
            )}
          </Field>
          <Field label="Owner organization">
            {({ id }) => (
              <input
                id={id}
                className="input"
                value={action.owner.organization}
                onChange={(e) => owner('organization', e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label="Owner email (optional)">
          {({ id }) => (
            <input
              id={id}
              type="email"
              className="input"
              value={action.owner.email}
              onChange={(e) => owner('email', e.target.value)}
            />
          )}
        </Field>
        <div className="row program-form-row">
          <Field label="Start date">
            {({ id }) => (
              <input
                id={id}
                type="date"
                className="input"
                value={action.startDate ?? ''}
                onChange={(e) =>
                  setAction((a) => ({ ...a, startDate: e.target.value || undefined }))
                }
              />
            )}
          </Field>
          <Field label="Due date">
            {({ id }) => (
              <input
                id={id}
                type="date"
                className="input"
                value={action.dueDate ?? ''}
                onChange={(e) => setAction((a) => ({ ...a, dueDate: e.target.value || undefined }))}
              />
            )}
          </Field>
        </div>
        <div className="row program-form-row">
          <Field label="Priority">
            {({ id }) => (
              <select
                id={id}
                className="select"
                value={action.priority}
                onChange={(e) => set('priority', e.target.value as ProgramAction['priority'])}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            )}
          </Field>
          <Field label="Capability element">
            {({ id }) => (
              <select
                id={id}
                className="select"
                value={action.element ?? ''}
                onChange={(e) =>
                  setAction((a) => ({
                    ...a,
                    element: (e.target.value || undefined) as ProgramAction['element'],
                  }))
                }
              >
                <option value="">Not set</option>
                {CAPABILITY_ELEMENTS.map((el) => (
                  <option key={el} value={el}>
                    {CAPABILITY_ELEMENT_LABELS[el]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Field label="Notes">
          {({ id }) => (
            <textarea
              id={id}
              className="textarea"
              value={action.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          )}
        </Field>
        {action.source.kind === 'aar_ip' && (
          <p className="muted">
            From the after-action report of {action.source.scenarioTitle ?? 'a scenario'}
            {action.source.projectName ? ` in ${action.source.projectName}` : ''}
            {action.source.exerciseDate ? `, exercise date ${action.source.exerciseDate}` : ''}.
          </p>
        )}
        <History action={action} />
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
      {statusOpen && (
        <StatusDialog
          programPath={props.programPath}
          ids={[action.id]}
          current={action.status}
          onClose={(changed) => {
            setStatusOpen(false)
            if (changed) {
              setAnnounce(`Status changed to ${CORRECTIVE_ACTION_STATUS_LABELS[changed]}`)
              void call('program:action-get', {
                programPath: props.programPath,
                id: action.id,
              }).then((v) => {
                setAction(v.action)
                setRevision(v.revision)
              })
            }
          }}
        />
      )}
    </Dialog>
  )
}
