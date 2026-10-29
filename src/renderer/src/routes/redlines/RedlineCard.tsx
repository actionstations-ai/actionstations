// One proposed edit of a plan section (#431, FR-3): the word diff, why, where it goes, and the
// choices - accept, reject, edit the proposed words, see the section around them.
import { useState } from 'react'
import { REDLINE_STATUS_LABELS, type Redline } from '@shared/schemas'
import { normalizedForm } from '@shared/redline/excerpt'
import { LABEL_TEXT, LABEL_TONE } from '../../lib/grounding'
import { Badge, Button, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { DiffView } from './DiffView'

const STATUS_TONE: Record<Redline['status'], 'neutral' | 'ok' | 'warn' | 'error' | 'info'> = {
  proposed: 'info',
  accepted: 'ok',
  rejected: 'neutral',
  exported: 'ok',
  applied: 'ok',
  not_applied: 'warn',
  needs_review: 'warn',
}

function Context(props: { projectPath: string; redline: Redline }) {
  const { redline: r } = props
  const chunks = useIpcQuery('documents:chunks', {
    projectPath: props.projectPath,
    documentId: r.target.documentId,
    limit: 500,
    offset: 0,
  })
  const here = (chunks.data ?? []).filter(
    (c) => normalizedForm(c.headingPath) === normalizedForm(r.target.headingPath),
  )
  if (chunks.isPending) return <p className="muted">Loading the section…</p>
  if (!here.length) return <p className="muted">The section is not in the index any more.</p>
  return (
    <blockquote className="redline__context">
      {here.map((c) => (
        <p key={c.id}>{c.text}</p>
      ))}
    </blockquote>
  )
}

function Editor(props: { redline: Redline; projectPath: string; onClose: () => void }) {
  const [text, setText] = useState(props.redline.proposedText)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await call('redlines:update', {
        projectPath: props.projectPath,
        id: props.redline.id,
        patch: { proposedText: text },
      })
      props.onClose()
    } catch (e) {
      toast.error('Could not save the change', errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="redline__editor">
      <Field label="Proposed text" hint="This replaces the current text above.">
        {({ id, describedBy }) => (
          <textarea
            id={id}
            aria-describedby={describedBy}
            className="textarea"
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
      </Field>
      <div className="row">
        <Button
          variant="primary"
          size="sm"
          disabled={busy || !text.trim()}
          onClick={() => void save()}
        >
          Save
        </Button>
        <Button size="sm" onClick={props.onClose}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function RedlineCard(props: {
  redline: Redline
  projectPath: string
  selected: boolean
  onSelect: (on: boolean) => void
}) {
  const { redline: r, projectPath } = props
  const [editing, setEditing] = useState(false)
  const [context, setContext] = useState(false)
  const open = r.status === 'proposed' || r.status === 'accepted'
  const mode = useIpcQuery('redlines:preview-tracked', { projectPath, id: r.id }, { enabled: open })
  const setStatus = async (to: 'accepted' | 'rejected' | 'proposed') => {
    try {
      await call('redlines:set-status', { projectPath, ids: [r.id], to, note: '' })
    } catch (e) {
      toast.error('Could not change the proposal', errorText(e))
    }
  }
  const where = `${r.target.documentTitle} › ${r.target.headingPath}`
  return (
    <li className="card redline" aria-label={`Proposed change to ${r.target.headingPath}`}>
      <div className="redline__head">
        <label className="redline__pick">
          <input
            type="checkbox"
            checked={props.selected}
            disabled={r.status !== 'accepted'}
            onChange={(e) => props.onSelect(e.target.checked)}
          />
          <span className="sr-only">Select for export</span>
        </label>
        <h3 className="redline__where">
          {where}
          {r.target.page ? <span className="muted"> · page {r.target.page}</span> : null}
        </h3>
        <Badge tone={STATUS_TONE[r.status]}>{REDLINE_STATUS_LABELS[r.status]}</Badge>
      </div>
      <div className="redline__meta">
        <Badge tone={r.target.sourceKind === 'docx' ? 'info' : 'neutral'}>
          {mode.data
            ? mode.data.mode === 'tracked'
              ? 'Word: tracked changes'
              : 'Change memo'
            : r.target.sourceKind === 'docx'
              ? 'Word plan'
              : `${r.target.sourceKind.toUpperCase()} plan: change memo`}
        </Badge>
        {r.grounding && r.grounding !== 'none' && (
          <Badge tone={LABEL_TONE[r.grounding]}>{LABEL_TEXT[r.grounding]}</Badge>
        )}
        <span className="muted">from {r.source.scenarioTitle}</span>
      </div>
      {mode.data?.mode === 'memo' && mode.data.reason && (
        <p className="muted redline__reason">{mode.data.reason}</p>
      )}
      <DiffView original={r.originalExcerpt} proposed={r.proposedText} />
      {r.rationale && (
        <p>
          <strong>Why:</strong> {r.rationale}
        </p>
      )}
      {r.grounding && r.grounding !== 'grounded' && r.grounding !== 'none' && (
        <p className="muted">
          Part of the proposed wording is not stated in the current section. Check it before use.
        </p>
      )}
      {editing ? (
        <Editor redline={r} projectPath={projectPath} onClose={() => setEditing(false)} />
      ) : (
        <div className="row redline__actions">
          {r.status !== 'accepted' && r.status !== 'exported' && r.status !== 'applied' && (
            <Button size="sm" variant="primary" onClick={() => void setStatus('accepted')}>
              Accept
            </Button>
          )}
          {r.status !== 'rejected' && open && (
            <Button size="sm" onClick={() => void setStatus('rejected')}>
              Reject
            </Button>
          )}
          {(r.status === 'rejected' || r.status === 'accepted') && (
            <Button size="sm" onClick={() => void setStatus('proposed')}>
              Back to proposed
            </Button>
          )}
          {open && (
            <Button size="sm" onClick={() => setEditing(true)}>
              Edit proposed text
            </Button>
          )}
          <Button size="sm" aria-expanded={context} onClick={() => setContext((c) => !c)}>
            {context ? 'Hide section' : 'Show section'}
          </Button>
        </div>
      )}
      {r.export && (
        <p className="muted">
          Exported as {r.export.mode === 'tracked' ? 'tracked changes' : 'a change memo'}:{' '}
          <span className="redline__file">{r.export.file}</span>
        </p>
      )}
      {context && <Context projectPath={projectPath} redline={r} />}
    </li>
  )
}
