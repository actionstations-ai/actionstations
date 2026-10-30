// The cloud approval dialog (#433, FR-7): exactly what one request would send, to which host and
// model, with redacted values highlighted. The decision echoes the manifest's hash, so the
// approval binds to the content shown here (FR-8).
import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { OutboundManifest, RedactionSpan } from '@shared/schemas'
import type { ApprovalDecision } from '@shared/ipc'
import { call, IpcError } from '../lib/api'
import { projectKey } from '../state/project'
import { refreshPending } from './privacy/approvals-store'
import {
  ALL_CATEGORIES,
  CATEGORY_LABEL,
  CATEGORY_MARK,
  excerptPart,
  formatCount,
  groupExcerpts,
  partLabel,
  segmentsOf,
  spansFor,
  taskLine,
  totalRedactions,
} from './privacy/privacy-model'
import { toast } from './toast-store'
import { Button, Dialog } from './ui'
import './privacy/privacy.css'

function Redacted({ span, text }: { span: RedactionSpan; text: string }) {
  const mark = CATEGORY_MARK[span.category]
  return (
    <mark className="redacted" title={`Sent as ${span.placeholder}`}>
      <span className="redacted__tag">[{mark}]</span> <span>{span.original || text}</span>{' '}
      <span className="redacted__sent">sent as {span.placeholder}</span>
    </mark>
  )
}

/** The text as it will be sent, with each redacted value shown and labelled. */
export function SentText({ text, spans }: { text: string; spans: RedactionSpan[] }) {
  return (
    <pre className="outbound-text" tabIndex={0}>
      {segmentsOf(text, spans).map((seg, i) =>
        'span' in seg ? (
          <Redacted key={i} span={seg.span} text={seg.text} />
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </pre>
  )
}

interface LeaveOut {
  chosen: ReadonlySet<number>
  toggle(chunkId: number): void
}

function Excerpts({ manifest, leaveOut }: { manifest: OutboundManifest; leaveOut?: LeaveOut }) {
  const groups = groupExcerpts(manifest.excerpts)
  if (!groups.length) return null
  return (
    <section aria-labelledby="outbound-excerpts" className="stack outbound-section">
      <h3 id="outbound-excerpts">
        Plan excerpts ({manifest.excerpts.length} from {groups.length}{' '}
        {groups.length === 1 ? 'document' : 'documents'})
      </h3>
      {groups.map((g) => (
        <details key={g.documentId} className="outbound-group">
          <summary>
            <strong>{g.documentTitle}</strong>{' '}
            <span className="muted">
              {g.excerpts.length} {g.excerpts.length === 1 ? 'excerpt' : 'excerpts'},{' '}
              {formatCount(g.chars)} characters
            </span>
          </summary>
          <ul className="outbound-excerpts">
            {g.excerpts.map((e) => (
              <li key={e.chunkId}>
                <p className="outbound-excerpt__head">
                  {e.headingPath || 'Untitled section'}
                  {e.page !== undefined && <span className="muted"> · page {e.page}</span>}
                  <span className="muted"> · {formatCount(e.chars)} characters</span>
                </p>
                {leaveOut && (
                  <label className="outbound-leave-out">
                    <input
                      type="checkbox"
                      checked={leaveOut.chosen.has(e.chunkId)}
                      onChange={() => leaveOut.toggle(e.chunkId)}
                    />{' '}
                    Leave this section out
                    <span className="sr-only">
                      {' '}
                      ({g.documentTitle}, {e.headingPath || 'untitled section'})
                    </span>
                  </label>
                )}
                <SentText text={e.text} spans={spansFor(manifest, excerptPart(e))} />
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  )
}

/** Embedding requests: the documents the texts come from, by name; the texts stay folded away. */
function EmbedSources({ manifest }: { manifest: OutboundManifest }) {
  const sources = manifest.sources ?? []
  return (
    <section aria-labelledby="outbound-sources" className="stack outbound-section">
      <h3 id="outbound-sources">
        Documents ({sources.length} {sources.length === 1 ? 'document' : 'documents'})
      </h3>
      <ul className="outbound-counts">
        {sources.map((s) => (
          <li key={s.title}>
            <strong>{s.title}</strong>{' '}
            <span className="muted">
              {s.passages} {s.passages === 1 ? 'passage' : 'passages'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function OtherParts({ manifest }: { manifest: OutboundManifest }) {
  if (!manifest.parts.length) return null
  const folded = !!manifest.sources?.length
  return (
    <section aria-labelledby="outbound-parts" className="stack outbound-section">
      <h3 id="outbound-parts">
        {folded
          ? 'Exact text'
          : `${manifest.excerpts.length ? 'Other content' : 'Content'} (${manifest.parts.length} ${
              manifest.parts.length === 1 ? 'part' : 'parts'
            })`}
      </h3>
      {manifest.parts.map((p) => (
        <details key={p.name} className="outbound-group">
          <summary>
            <strong>{partLabel(p.name)}</strong>{' '}
            <span className="muted">{formatCount(p.chars)} characters</span>
          </summary>
          <SentText text={p.text} spans={spansFor(manifest, p.name)} />
        </details>
      ))}
    </section>
  )
}

function RedactionSummary({ manifest }: { manifest: OutboundManifest }) {
  if (!manifest.redactable)
    return (
      <p className="outbound-note" role="note">
        Redaction does not apply to embedding requests: the text is sent as shown, because search
        would not work on placeholders.
      </p>
    )
  const total = totalRedactions(manifest)
  return (
    <section aria-labelledby="outbound-redaction" className="stack outbound-section">
      <h3 id="outbound-redaction">Redaction</h3>
      {total === 0 ? (
        <p>Nothing was redacted in this request.</p>
      ) : (
        <ul className="outbound-counts">
          {ALL_CATEGORIES.filter((c) => manifest.redactions[c]).map((c) => (
            <li key={c}>
              {CATEGORY_LABEL[c]}: {manifest.redactions[c]} replaced with{' '}
              {manifest.kind === 'media' ? 'plain stand-ins' : 'placeholders'}
            </li>
          ))}
        </ul>
      )}
      <p className="muted">
        Pattern-based: review the highlighted text. Values the patterns miss are sent as written.{' '}
        {manifest.kind === 'media'
          ? 'Images and audio cannot be changed back, so names and contact details become plain words such as “a staff member”.'
          : 'Placeholders in the reply are changed back on this computer.'}
      </p>
    </section>
  )
}

function useDecide(manifest: OutboundManifest, onDone: () => void) {
  const [busy, setBusy] = useState(false)
  const decide = async (decision: ApprovalDecision, leaveOut?: number[]) => {
    setBusy(true)
    try {
      await call('privacy:decide', {
        requestId: manifest.requestId,
        requestHash: manifest.requestHash,
        decision,
        ...(leaveOut ? { leaveOut } : {}),
      })
      onDone()
    } catch (err) {
      const changed = err instanceof IpcError && ['CONFLICT', 'NOT_FOUND'].includes(err.code)
      toast.error(
        changed ? 'This request changed or is no longer waiting' : 'Could not send your answer',
        changed ? 'Review the request again before you decide.' : err,
      )
      await refreshPending().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }
  return { busy, decide }
}

export function OutboundApprovalDialog(props: {
  manifest: OutboundManifest
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const m = props.manifest
  const navigate = useNavigate()
  const close = () => props.onOpenChange(false)
  const { busy, decide } = useDecide(m, close)
  const changeRedaction = () => {
    close()
    navigate(m.projectPath ? `/p/${projectKey(m.projectPath)}/privacy` : '/settings#privacy')
  }
  const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set())
  const toggle = (id: number) =>
    setChosen((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const canLeaveOut = !!m.jobId && m.excerpts.length > 0
  const host = m.host || m.providerLabel
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      className="dialog--wide"
      title={m.host ? `Send to ${m.providerLabel} (${m.host})?` : `Send to ${m.providerLabel}?`}
      description={`If you send it, this request leaves your computer and goes to ${host}, model ${m.model}. Nothing is sent until you choose.`}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={() => void decide('cancel')}>
            {m.jobId ? 'Cancel job' : 'Do not send'}
          </Button>
          {m.redactable && (
            <Button disabled={busy} onClick={changeRedaction}>
              Change redaction
            </Button>
          )}
          {canLeaveOut && chosen.size > 0 && (
            <Button disabled={busy} onClick={() => void decide('leave-out', [...chosen])}>
              Leave out {chosen.size} {chosen.size === 1 ? 'section' : 'sections'} and review again
            </Button>
          )}
          {m.excerpts.length > 0 && m.jobId && (
            <Button disabled={busy} onClick={() => void decide('approve-documents')}>
              Send and approve these documents for this job
            </Button>
          )}
          <Button variant="primary" disabled={busy} onClick={() => void decide('send')}>
            Send
          </Button>
        </>
      }
    >
      <p className="muted outbound-meta">
        {taskLine(m)} · {formatCount(m.totalChars)} characters, about{' '}
        {formatCount(m.estimatedTokens)} tokens
      </p>
      {m.review === 'per-job' && (
        <p className="outbound-note" role="note">
          Your review setting asks once per job: later requests in this job go without asking.
        </p>
      )}
      <RedactionSummary manifest={m} />
      {m.images?.map((img) => (
        <figure key={img.name} className="outbound-image">
          <img src={img.dataUrl} alt={`${img.name} sent with this request`} />
          <figcaption>{img.name}: sent with this request</figcaption>
        </figure>
      ))}
      {m.kind === 'embed' && <EmbedSources manifest={m} />}
      <Excerpts manifest={m} {...(canLeaveOut ? { leaveOut: { chosen, toggle } } : {})} />
      <OtherParts manifest={m} />
    </Dialog>
  )
}
