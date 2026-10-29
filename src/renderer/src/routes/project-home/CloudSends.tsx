// The project's send log (#433, FR-16): one row per cloud request, with when, where, which
// sections, how much was redacted and how it was approved. The log holds no prompt text.
import { useMemo, useState } from 'react'
import type { CloudSendEntry } from '@shared/schemas'
import { ALL_CATEGORIES, CATEGORY_LABEL } from '../../components/privacy/privacy-model'
import { EmptyState } from '../../components/ui'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { filterSends, type Filters } from './cloud-sends-model'
import '../../components/privacy/privacy.css'

const APPROVAL_LABEL: Record<CloudSendEntry['approval'], string> = {
  asked: 'You approved it',
  'job-approval': 'Approved earlier in the job',
  'document-approval': 'Documents approved for the job',
  'policy-off': 'Sent without asking (review off)',
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const totalChars = (e: CloudSendEntry) => Object.values(e.chars).reduce((a, b) => a + b, 0)

function redactionText(e: CloudSendEntry): string {
  const parts = ALL_CATEGORIES.filter((c) => e.redactions[c]).map(
    (c) => `${CATEGORY_LABEL[c]}: ${e.redactions[c]}`,
  )
  return parts.length ? parts.join(', ') : 'None'
}

function FilterBar(props: { entries: CloudSendEntry[]; f: Filters; set: (f: Filters) => void }) {
  const providers = [...new Map(props.entries.map((e) => [e.providerId, e.providerLabel]))]
  const stages = [...new Set(props.entries.map((e) => e.stage ?? e.task))].sort()
  return (
    <div className="row cloud-sends-filters">
      <label className="field">
        <span className="field__label">Provider</span>
        <select
          className="select"
          value={props.f.provider}
          onChange={(e) => props.set({ ...props.f, provider: e.target.value })}
        >
          <option value="">All providers</option>
          {providers.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Stage or task</span>
        <select
          className="select"
          value={props.f.stage}
          onChange={(e) => props.set({ ...props.f, stage: e.target.value })}
        >
          <option value="">All</option>
          {stages.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">From date</span>
        <input
          type="date"
          className="input"
          value={props.f.from}
          onChange={(e) => props.set({ ...props.f, from: e.target.value })}
        />
      </label>
    </div>
  )
}

function SendRow({ e }: { e: CloudSendEntry }) {
  const sections = [...new Set(e.excerpts.map((x) => x.headingPath))]
  return (
    <tr>
      <td>{when(e.at)}</td>
      <td>
        {e.providerLabel}
        <br />
        <span className="muted mono">{e.host}</span>
      </td>
      <td>
        {e.stage ?? e.task}
        {e.itemId && <span className="muted"> · {e.itemId}</span>}
        <br />
        <span className="muted">{e.model}</span>
      </td>
      <td>
        {e.excerpts.length === 0 ? (
          <span className="muted">No plan excerpts</span>
        ) : (
          <details>
            <summary>
              {e.excerpts.length} {e.excerpts.length === 1 ? 'excerpt' : 'excerpts'}
            </summary>
            <ul>
              {sections.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </details>
        )}
      </td>
      <td>{totalChars(e).toLocaleString()}</td>
      <td>{redactionText(e)}</td>
      <td>{APPROVAL_LABEL[e.approval]}</td>
    </tr>
  )
}

export function CloudSends({ projectPath }: { projectPath: string }) {
  const sends = useIpcQuery('privacy:sends', { projectPath, limit: 500 })
  const [f, setF] = useState<Filters>({ provider: '', stage: '', from: '' })
  const all = useMemo(() => sends.data ?? [], [sends.data])
  const shown = useMemo(() => filterSends(all, f), [all, f])
  return (
    <section className="card stack" aria-labelledby="cloud-sends-heading">
      <div>
        <h2 id="cloud-sends-heading">Sent to cloud</h2>
        <p className="muted">
          Every request this project sent to a cloud provider, newest first. Kept in{' '}
          <span className="mono">cloud-sends.jsonl</span> in the project folder. It lists section
          headings and sizes only, never the text or the redacted values.
        </p>
      </div>
      {sends.isError && (
        <p className="field__error" role="alert">
          {errorText(sends.error)}
        </p>
      )}
      {sends.data && all.length === 0 && (
        <EmptyState
          title="Nothing has been sent to a cloud provider"
          body="Requests to local providers are not listed. Cloud requests appear here once they are sent."
        />
      )}
      {all.length > 0 && (
        <>
          <FilterBar entries={all} f={f} set={setF} />
          <p className="muted" aria-live="polite">
            Showing {shown.length} of {all.length}
          </p>
          <div className="cloud-sends-scroll">
            <table className="cloud-sends-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Provider</th>
                  <th scope="col">Stage and model</th>
                  <th scope="col">Plan sections</th>
                  <th scope="col">Characters</th>
                  <th scope="col">Redacted</th>
                  <th scope="col">Approval</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e, i) => (
                  <SendRow key={`${e.at}-${e.requestHash}-${i}`} e={e} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
