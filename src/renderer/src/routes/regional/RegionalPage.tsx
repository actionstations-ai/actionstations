// Regional exercises (#440): several organizations plan one exercise and keep their documents
// on their own computers. This screen holds this computer’s organization identities, joining an
// exercise from a host’s frame, and the planning rounds of a scenario that is part of one.
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import type { BundleSummary } from '@shared/ipc/regional'
import { OrgPrefix } from '@shared/schemas/regional'
import { EmptyState, Field, PageHeader } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { BundleReview, FingerprintText } from './BundleReview'
import { ScenarioPanel } from './ScenarioPanel'
import { refreshRegional } from './refresh'
import './regional.css'

function Identities() {
  const ids = useIpcQuery('regional:identities', undefined)
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('')
  const valid = OrgPrefix.safeParse(prefix).success && name.trim() !== ''
  const create = async () => {
    try {
      await call('regional:identity-create', { name, prefix })
      setName('')
      setPrefix('')
      await refreshRegional()
    } catch (e) {
      toast.error('Could not create the identity', errorText(e))
    }
  }
  return (
    <section className="card stack" aria-labelledby="regional-ids-title">
      <h2 id="regional-ids-title" className="section-title">
        Your organizations on this computer
      </h2>
      <p className="muted">
        Each organization has a signing key kept in this computer’s secure storage. Partners compare
        its fingerprint with you by phone or in person before they trust your bundles.
      </p>
      {(ids.data ?? []).length === 0 ? (
        <p className="muted">None yet. Create one to host or join an exercise.</p>
      ) : (
        <ul className="regional-list">
          {ids.data!.map((i) => (
            <li key={i.orgId}>
              {i.name} ({i.prefix}): <FingerprintText value={i.fingerprint} />
            </li>
          ))}
        </ul>
      )}
      <div className="regional-form">
        <Field label="Organization name">
          {({ id }) => (
            <input
              id={id}
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Short prefix" hint="2 to 6 capital letters, for example AIR">
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input"
              aria-describedby={describedBy}
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
            />
          )}
        </Field>
      </div>
      <div className="row">
        <button type="button" className="btn" disabled={!valid} onClick={() => void create()}>
          Create identity
        </button>
      </div>
    </section>
  )
}

function Join(props: { projectPath: string; initialPath?: string | null }) {
  const { projectPath } = props
  const ids = useIpcQuery('regional:identities', undefined)
  const [chosen, setChosen] = useState<{ path: string; summary: BundleSummary } | null>(null)
  const opened = useIpcQuery(
    'regional:inspect',
    { path: props.initialPath ?? '' },
    { enabled: !!props.initialPath },
  )
  const file =
    chosen ??
    (props.initialPath && opened.data ? { path: props.initialPath, summary: opened.data } : null)
  const [orgId, setOrgId] = useState('')
  const [busy, setBusy] = useState(false)
  const load = async (path: string) => {
    try {
      setChosen({ path, summary: await call('regional:inspect', { path }) })
    } catch (e) {
      toast.error('Could not open the bundle', errorText(e))
    }
  }
  const choose = async () => {
    const files = await call('dialog:open-files', {
      title: 'Open the host’s frame',
      filters: [{ name: 'Exercise bundle', extensions: ['asexercise'] }],
      multi: false,
    })
    if (files[0]) await load(files[0])
  }
  const join = async (fingerprint: string) => {
    setBusy(true)
    try {
      await call('regional:join', {
        path: file!.path,
        projectPath,
        orgId: orgId || ids.data?.[0]?.orgId || '',
        confirmFingerprint: fingerprint,
      })
      toast.success('Joined', 'A new scenario was created in this project from the host’s frame.')
      setChosen(null)
      await refreshRegional()
      await call('scenarios:list', { projectPath })
    } catch (e) {
      toast.error('Could not join', errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const s = file?.summary
  return (
    <section className="card stack" aria-labelledby="regional-join-title">
      <h2 id="regional-join-title" className="section-title">
        Join an exercise
      </h2>
      <p className="muted">
        Open the frame the host sent you. Opening shows what it contains and who signed it; nothing
        is applied until you join.
      </p>
      <div className="row">
        <button type="button" className="btn" onClick={() => void choose()}>
          Open a frame…
        </button>
      </div>
      {s && s.kind === 'slice' && (
        <p role="alert">That is a slice, not a frame. The host merges slices.</p>
      )}
      {s && s.kind !== 'slice' && (
        <BundleReview
          summary={s}
          busy={busy || !(ids.data ?? []).length}
          confirmLabel="Join this exercise"
          onConfirm={(f) => void join(f)}
          extra={
            <Field label="Join as">
              {({ id }) => (
                <select
                  id={id}
                  className="select"
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                >
                  {(ids.data ?? []).map((i) => (
                    <option key={i.orgId} value={i.orgId}>
                      {i.name} ({i.prefix})
                    </option>
                  ))}
                </select>
              )}
            </Field>
          }
        />
      )}
    </section>
  )
}

export default function RegionalPage() {
  const { projectKey = '' } = useParams()
  const [params] = useSearchParams()
  const projectPath = fromProjectKey(projectKey)
  const scenarios = useIpcQuery('scenarios:list', { projectPath })
  const [scenarioId, setScenarioId] = useState('')
  const current = scenarioId || scenarios.data?.[0]?.id || ''
  return (
    <div className="page regional-page">
      <PageHeader
        eyebrow="Collaborate"
        title="Regional exercises"
        description="Plan one exercise with other organizations while each keeps its documents on its own computer. You exchange only exercise material, in bundles signed by each organization."
      />
      <Identities />
      <Join projectPath={projectPath} initialPath={params.get('bundle')} />
      <section className="stack" aria-labelledby="regional-scn-title">
        <h2 id="regional-scn-title" className="section-title">
          Scenario
        </h2>
        {(scenarios.data ?? []).length === 0 ? (
          <EmptyState
            title="No scenarios in this project"
            body="Create one first, or join an exercise above."
          />
        ) : (
          <>
            <Field label="Scenario">
              {({ id }) => (
                <select
                  id={id}
                  className="select"
                  value={current}
                  onChange={(e) => setScenarioId(e.target.value)}
                >
                  {scenarios.data!.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {current && <ScenarioPanel projectPath={projectPath} scenarioId={current} />}
          </>
        )}
      </section>
    </div>
  )
}
