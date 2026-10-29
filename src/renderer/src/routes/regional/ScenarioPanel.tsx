// The Regional tab of one scenario (spec 0440): organizations and pins, sharing settings,
// export of the frame, a slice or the merged exercise (with the review of what leaves), import
// and merge, proposals, and Finalize.
import { useState } from 'react'
import type { BundleKind, RegionalState } from '@shared/schemas/regional'
import type { BundleSummary, ExportReview, MergePreviewView } from '@shared/ipc/regional'
import { Badge, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { refreshRegional } from './refresh'
import { BundleReview, FingerprintText } from './BundleReview'
import { MergeReview } from './MergeReview'
import { ProposalsPanel } from './ProposalsPanel'
import { ExportReviewPanel } from './ExportReviewPanel'

const BUNDLE_FILTER = [{ name: 'Exercise bundle', extensions: ['asexercise'] }]

function OrgsTable({ state }: { state: RegionalState }) {
  return (
    <table className="regional-table">
      <caption className="sr-only">Organizations in this exercise</caption>
      <thead>
        <tr>
          <th scope="col">Organization</th>
          <th scope="col">Prefix</th>
          <th scope="col">Fingerprint</th>
          <th scope="col">Key</th>
        </tr>
      </thead>
      <tbody>
        {state.orgs.map((o) => (
          <tr key={o.orgId}>
            <th scope="row">
              {o.name}
              {o.orgId === state.thisOrg && ' (this computer)'}
              {o.orgId === state.hostOrg && ' (host)'}
            </th>
            <td>{o.prefix}</td>
            <td>
              {o.fingerprint ? <FingerprintText value={o.fingerprint} /> : 'Not received yet'}
            </td>
            <td>
              {o.publicKey ? (
                <Badge tone="ok">Pinned</Badge>
              ) : (
                <Badge tone="warn">Not pinned</Badge>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SetupForm(props: { projectPath: string; scenarioId: string }) {
  const ids = useIpcQuery('regional:identities', undefined)
  const [host, setHost] = useState('')
  const [others, setOthers] = useState('')
  const create = async () => {
    const orgs = others
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [name = '', prefix = ''] = l.split('|').map((p) => p.trim())
        return { name, prefix: prefix.toUpperCase() }
      })
    try {
      await call('regional:create', { ...props, hostOrg: host || ids.data?.[0]?.orgId || '', orgs })
      await refreshRegional()
    } catch (e) {
      toast.error('Could not set up the exercise', errorText(e))
    }
  }
  return (
    <section className="card stack" aria-labelledby="regional-setup-title">
      <h2 id="regional-setup-title" className="section-title">
        Set up a regional exercise
      </h2>
      <p className="muted">
        You become the host: you write the shared frame and merge each organization’s part. Partners
        get only exercise material, never your plans.
      </p>
      <Field label="Your organization">
        {({ id }) => (
          <select id={id} className="select" value={host} onChange={(e) => setHost(e.target.value)}>
            {(ids.data ?? []).map((i) => (
              <option key={i.orgId} value={i.orgId}>
                {i.name} ({i.prefix})
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field
        label="Partner organizations"
        hint="One per line: name | PREFIX, for example Lakeshore Regional Hospital | HOSP"
      >
        {({ id, describedBy }) => (
          <textarea
            id={id}
            className="textarea"
            rows={4}
            aria-describedby={describedBy}
            value={others}
            onChange={(e) => setOthers(e.target.value)}
          />
        )}
      </Field>
      <div className="row">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!ids.data?.length || !others.trim()}
          onClick={() => void create()}
        >
          Create regional exercise
        </button>
      </div>
    </section>
  )
}

function ExportSection(props: { projectPath: string; scenarioId: string; state: RegionalState }) {
  const { projectPath, scenarioId, state } = props
  const [review, setReview] = useState<ExportReview | null>(null)
  const open = async (kind: BundleKind) => {
    try {
      setReview(await call('regional:export-review', { projectPath, scenarioId, kind }))
    } catch (e) {
      toast.error('Could not prepare the export', errorText(e))
    }
  }
  const save = async (kind: BundleKind) => {
    const path = await call('dialog:save-file', {
      title: 'Save exercise bundle',
      defaultPath: `${kind}.asexercise`,
      filters: BUNDLE_FILTER,
    })
    if (!path) return
    try {
      const out = await call('regional:export', { projectPath, scenarioId, kind, path })
      toast.success('Bundle saved', out.path)
      setReview(null)
      await refreshRegional()
    } catch (e) {
      toast.error('Could not save', errorText(e))
    }
  }
  const host = state.role === 'host'
  return (
    <section className="card stack" aria-labelledby="regional-export-title">
      <h2 id="regional-export-title" className="section-title">
        Send
      </h2>
      <div className="row regional-actions">
        {host && (
          <button type="button" className="btn" onClick={() => void open('frame')}>
            Review frame to send
          </button>
        )}
        <button type="button" className="btn" onClick={() => void open('slice')}>
          Review my slice to send
        </button>
        {host && (
          <button type="button" className="btn" onClick={() => void open('merged')}>
            Review merged exercise to send
          </button>
        )}
      </div>
      {review && (
        <ExportReviewPanel
          review={review}
          onSave={() => void save(review.kind)}
          onCancel={() => setReview(null)}
        />
      )}
    </section>
  )
}

function ImportSection(props: { projectPath: string; scenarioId: string; state: RegionalState }) {
  const { projectPath, scenarioId, state } = props
  const [summary, setSummary] = useState<{ path: string; value: BundleSummary } | null>(null)
  const [paths, setPaths] = useState<string[]>([])
  const [preview, setPreview] = useState<MergePreviewView | null>(null)
  const [busy, setBusy] = useState(false)
  const guard = async (fn: () => Promise<void>, title: string) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast.error(title, errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const pick = async (multi: boolean) => {
    const files = await call('dialog:open-files', {
      title: 'Open exercise bundle',
      filters: BUNDLE_FILTER,
      multi,
    })
    if (files.length) return files
    return null
  }
  const openOne = async () => {
    const files = await pick(false)
    if (!files) return
    await guard(async () => {
      const value = await call('regional:inspect', { path: files[0]!, projectPath, scenarioId })
      setSummary({ path: files[0]!, value })
    }, 'Could not open the bundle')
  }
  const openSlices = async () => {
    const files = await pick(true)
    if (!files) return
    await guard(async () => {
      setPaths(files)
      setPreview(await call('regional:merge-preview', { projectPath, scenarioId, paths: files }))
    }, 'Could not read the slices')
  }
  const pinIt = (fingerprint: string) =>
    guard(async () => {
      await call('regional:pin', {
        projectPath,
        scenarioId,
        path: summary!.path,
        confirmFingerprint: fingerprint,
        replace: summary!.value.pin === 'changed',
      })
      toast.success('Key pinned', 'Later bundles from this organization are checked against it.')
      setSummary(null)
      await refreshRegional()
    }, 'Could not pin the key')
  const importMerged = () =>
    guard(async () => {
      const out = await call('regional:import-merged', {
        projectPath,
        scenarioId,
        path: summary!.path,
      })
      toast.success('Merged exercise imported', out.changes.join(' · ') || 'No changes')
      setSummary(null)
      await refreshRegional()
    }, 'Could not import the merged exercise')
  const applyMerge = (accept: { orgId: string; revision: number }[]) =>
    guard(async () => {
      const out = await call('regional:merge-apply', { projectPath, scenarioId, paths, accept })
      toast.success(
        'Merged',
        `${accept.length} slice(s) merged; ${out.conflicts.length} conflict notes.`,
      )
      setPreview(null)
      await refreshRegional()
    }, 'Could not merge')
  const s = summary?.value
  return (
    <section className="card stack" aria-labelledby="regional-import-title">
      <h2 id="regional-import-title" className="section-title">
        Receive
      </h2>
      <div className="row regional-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => void openOne()}>
          Open a bundle…
        </button>
        {state.role === 'host' && (
          <button type="button" className="btn" disabled={busy} onClick={() => void openSlices()}>
            Merge slices…
          </button>
        )}
      </div>
      {s && (s.pin === 'new' || s.pin === 'changed') && (
        <BundleReview
          summary={s}
          busy={busy}
          confirmLabel={
            s.pin === 'changed' ? 'Key changed: I verified the new fingerprint' : 'Pin this key'
          }
          onConfirm={(f) => void pinIt(f)}
        />
      )}
      {s && s.pin === 'pinned' && s.kind === 'merged' && state.role === 'participant' && (
        <BundleReview
          summary={s}
          busy={busy}
          confirmLabel="Import the merged exercise"
          onConfirm={() => void importMerged()}
        />
      )}
      {s && s.pin === 'pinned' && s.kind !== 'merged' && (
        <p role="status">
          {s.from.name}’s {s.kind} is signed by the pinned key.{' '}
          {s.kind === 'slice' ? 'Use Merge slices to bring it in.' : 'Nothing to import here.'}
        </p>
      )}
      {s && s.pin === 'unknown_org' && (
        <p role="alert">This bundle is from an organization that is not part of this exercise.</p>
      )}
      {preview && <MergeReview preview={preview} busy={busy} onApply={(a) => void applyMerge(a)} />}
    </section>
  )
}

export function ScenarioPanel(props: { projectPath: string; scenarioId: string }) {
  const { projectPath, scenarioId } = props
  const q = useIpcQuery('regional:state', { projectPath, scenarioId })
  const state = q.data
  const update = async (patch: { shareQuotes?: boolean; shareFullLog?: boolean }) => {
    try {
      await call('regional:settings', { projectPath, scenarioId, ...patch })
      await refreshRegional()
    } catch (e) {
      toast.error('Could not save', errorText(e))
    }
  }
  const finalize = async () => {
    try {
      await call('regional:finalize', { projectPath, scenarioId })
      await refreshRegional()
    } catch (e) {
      toast.error('Could not finalize', errorText(e))
    }
  }
  if (q.isPending) return <p className="muted">Loading…</p>
  if (!state) return <SetupForm projectPath={projectPath} scenarioId={scenarioId} />
  return (
    <div className="stack">
      <section className="card stack" aria-labelledby="regional-orgs-title">
        <h2 id="regional-orgs-title" className="section-title">
          {state.role === 'host' ? 'Hosting' : 'Taking part in'} this exercise
          {state.final && ' (Final)'}
        </h2>
        <p className="muted">
          Frame version {state.frameVersion}
          {state.merged ? ` · last merged ${state.merged.version}` : ''}
        </p>
        <OrgsTable state={state} />
        <label className="row">
          <input
            type="checkbox"
            checked={state.shareQuotes}
            onChange={(e) => void update({ shareQuotes: e.target.checked })}
          />
          Share plan quotes with partners (otherwise only document titles and headings)
        </label>
        {state.role === 'host' && (
          <>
            <label className="row">
              <input
                type="checkbox"
                checked={state.shareFullLog}
                onChange={(e) => void update({ shareFullLog: e.target.checked })}
              />
              Share the full session log with every organization (all parties must agree)
            </label>
            <div className="row">
              <button
                type="button"
                className="btn"
                disabled={state.final}
                onClick={() => void finalize()}
              >
                Mark the exercise Final
              </button>
            </div>
          </>
        )}
      </section>
      <ExportSection projectPath={projectPath} scenarioId={scenarioId} state={state} />
      <ImportSection projectPath={projectPath} scenarioId={scenarioId} state={state} />
      <ProposalsPanel projectPath={projectPath} scenarioId={scenarioId} state={state} />
    </div>
  )
}
