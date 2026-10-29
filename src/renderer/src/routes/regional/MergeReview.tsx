// The host's merge review (spec 0440 FR-14, FR-15): for each organization the rows added,
// changed and removed against the last merged version, the conflicts, and Accept. The status is
// always a word, never a color alone.
import { useState } from 'react'
import type { MergePreviewView } from '@shared/ipc/regional'
import { Badge } from '../../components/ui'
import { FingerprintText } from './BundleReview'

const show = (v: unknown): string => (Array.isArray(v) ? v.join(', ') : String(v ?? ''))

function OrgTable({ org }: { org: MergePreviewView['orgs'][number] }) {
  const rows = [
    ...org.added.map((id) => ({ id, status: 'added', detail: '' })),
    ...org.changed.map((c) => ({
      id: c.id,
      status: 'changed',
      detail: c.fields
        .map((f) => `${f.field}: "${show(f.before)}" to "${show(f.after)}"`)
        .join('; '),
    })),
    ...org.removed.map((id) => ({ id, status: 'removed', detail: '' })),
  ]
  return (
    <table className="regional-table">
      <caption className="sr-only">Changes from {org.orgId.toUpperCase()}</caption>
      <thead>
        <tr>
          <th scope="col">Row</th>
          <th scope="col">Change</th>
          <th scope="col">Detail</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={3}>No changes since the last merged version.</td>
          </tr>
        )}
        {rows.map((r) => (
          <tr key={`${r.status}-${r.id}`}>
            <th scope="row">
              {r.id}
              {org.placeholders.includes(r.id) && ' (private placeholder)'}
            </th>
            <td>{r.status}</td>
            <td>{r.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function MergeReview(props: {
  preview: MergePreviewView
  busy: boolean
  onApply: (accept: { orgId: string; revision: number }[]) => void
}) {
  const { preview } = props
  const [accepted, setAccepted] = useState<Record<string, boolean>>({})
  const usable = preview.orgs.filter((o) => o.usable)
  return (
    <section className="card stack" aria-labelledby="merge-review-title">
      <h2 id="merge-review-title" className="section-title">
        Merge review
      </h2>
      {preview.bundles
        .filter((b) => b.pin !== 'pinned')
        .map((b) => (
          <p key={b.path} role="alert">
            <Badge tone="error">Not merged</Badge> {b.orgId.toUpperCase()} signed with a key that is
            not pinned yet (<FingerprintText value={b.fingerprint} />
            ). Pin it first.
          </p>
        ))}
      {preview.orgs.map((org) => (
        <div key={org.orgId} className="stack">
          <h3>
            {org.orgId.toUpperCase()}, revision {org.revision}
          </h3>
          {org.usable ? <OrgTable org={org} /> : <p>This slice was rejected as a whole.</p>}
          {org.rejectedRows.length > 0 && (
            <p>
              <Badge tone="error">Rejected</Badge> {org.rejectedRows.join(', ')}
            </p>
          )}
        </div>
      ))}
      {preview.conflicts.length > 0 && (
        <div>
          <h3>Conflicts</h3>
          <ul className="regional-list">
            {preview.conflicts.map((c, n) => (
              <li key={n}>
                <Badge tone={c.severity === 'rejected' ? 'error' : 'warn'}>
                  {c.severity === 'rejected' ? 'Rejected' : 'Warning'}
                </Badge>{' '}
                {c.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <fieldset className="stack">
        <legend>Accept for the merged exercise</legend>
        {usable.map((o) => (
          <label key={o.orgId} className="row">
            <input
              type="checkbox"
              checked={accepted[o.orgId] ?? true}
              onChange={(e) => setAccepted({ ...accepted, [o.orgId]: e.target.checked })}
            />
            {o.orgId.toUpperCase()} revision {o.revision}
          </label>
        ))}
      </fieldset>
      <div className="row">
        <button
          type="button"
          className="btn btn--primary"
          disabled={props.busy || usable.length === 0}
          onClick={() =>
            props.onApply(
              usable
                .filter((o) => accepted[o.orgId] ?? true)
                .map((o) => ({ orgId: o.orgId, revision: o.revision })),
            )
          }
        >
          Merge accepted slices
        </button>
      </div>
    </section>
  )
}
