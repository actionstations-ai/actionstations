// What a verified bundle contains and who signed it (spec 0440 FR-3, FR-4). Opening never
// applies anything. The user compares the signer's fingerprint with one received another way
// and types it before a key is pinned.
import { useState } from 'react'
import type { BundleSummary } from '@shared/ipc/regional'
import { Badge, Field } from '../../components/ui'

/** A fingerprint read aloud in groups: "a b c d" style, one group at a time for screen readers. */
export function FingerprintText({ value }: { value: string }) {
  return (
    <span className="regional-fingerprint">
      <span aria-hidden="true">{value}</span>
      <span className="sr-only">{value.split(' ').join(', ')}</span>
    </span>
  )
}

const PIN_TEXT: Record<
  BundleSummary['pin'],
  { tone: 'ok' | 'warn' | 'error' | 'info'; text: string }
> = {
  pinned: { tone: 'ok', text: 'Signed by the pinned key' },
  new: { tone: 'warn', text: 'First bundle from this organization: compare the fingerprint' },
  changed: { tone: 'error', text: 'Signed by a different key than the one pinned' },
  unknown_org: { tone: 'error', text: 'This organization is not part of the exercise' },
  no_exercise: { tone: 'info', text: 'Not yet part of an exercise on this computer' },
}

export function BundleReview(props: {
  summary: BundleSummary
  /** Called with the typed fingerprint when the user confirms. */
  confirmLabel: string
  onConfirm: (fingerprint: string) => void
  busy?: boolean
  /** Extra controls shown before the confirm button (for example "which organization are you"). */
  extra?: React.ReactNode
}) {
  const { summary: s } = props
  const [typed, setTyped] = useState('')
  const pin = PIN_TEXT[s.pin]
  return (
    <section className="card stack" aria-labelledby="bundle-review-title">
      <h2 id="bundle-review-title" className="section-title">
        {s.title}
      </h2>
      <p>
        <Badge tone={pin.tone}>{pin.text}</Badge>
      </p>
      <dl className="regional-dl">
        <dt>Kind</dt>
        <dd>
          {s.kind === 'frame' ? 'Frame' : s.kind === 'slice' ? 'Slice' : 'Merged exercise'}
          {s.final ? ' (Final)' : ''}
        </dd>
        <dt>From</dt>
        <dd>
          {s.from.name} ({s.from.prefix})
        </dd>
        <dt>Fingerprint</dt>
        <dd>
          <FingerprintText value={s.from.fingerprint} />
        </dd>
        <dt>Frame version</dt>
        <dd>{s.frameVersion}</dd>
      </dl>
      {s.orgs.length > 0 && (
        <p>Organizations: {s.orgs.map((o) => `${o.name} (${o.prefix})`).join(', ')}</p>
      )}
      {s.frame && (
        <p>
          Frame: {s.frame.objectives} objectives, {s.frame.phases} phases, {s.frame.roles} roles,{' '}
          {s.frame.sharedRows} shared rows.
        </p>
      )}
      {s.slices.length > 0 && (
        <ul className="regional-list">
          {s.slices.map((x) => (
            <li key={x.orgId}>
              {x.orgId.toUpperCase()}: revision {x.revision}, {x.rows} rows ({x.privateRows} private
              placeholders), {x.injects} injects, {x.proposals} proposals
            </li>
          ))}
        </ul>
      )}
      {s.mediaFiles > 0 && <p>{s.mediaFiles} media files.</p>}
      {s.pin !== 'pinned' && s.pin !== 'unknown_org' && (
        <Field
          label="Fingerprint from the sender"
          hint="Ask them by phone or in person to read theirs, then type it here. Spaces and capitals do not matter."
        >
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input"
              aria-describedby={describedBy}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </Field>
      )}
      {props.extra}
      {s.pin !== 'unknown_org' && (
        <div className="row">
          <button
            type="button"
            className="btn btn--primary"
            disabled={props.busy || (s.pin !== 'pinned' && typed.trim() === '')}
            onClick={() => props.onConfirm(typed)}
          >
            {props.confirmLabel}
          </button>
        </div>
      )}
    </section>
  )
}
