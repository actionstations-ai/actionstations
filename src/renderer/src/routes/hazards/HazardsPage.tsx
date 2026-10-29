// Hazard context (#439): dated snapshots of public hazard data for the project's area. Nothing is
// fetched until the user presses Fetch; the dialog says what is sent where. After a fetch the
// snapshot is plain data in the project, so exercises work offline.
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import type { HazardIndexEntry } from '@shared/schemas'
import { Badge, Button, EmptyState, PageHeader } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { queryClient, useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { FetchDialog } from './FetchDialog'
import { ImportLayerDialog } from './ImportLayerDialog'
import { NOT_OPERATIONAL, formatWhen } from './hazard-view'
import { SnapshotView } from './SnapshotView'
import './hazards.css'

function SnapshotRow(props: {
  entry: HazardIndexEntry
  active: boolean
  viewing: boolean
  projectPath: string
  onView: () => void
}) {
  const { entry, projectPath } = props
  const [label, setLabel] = useState(entry.label)
  const update = async (patch: { label?: string; pinned?: boolean; active?: boolean }) => {
    try {
      await call('hazards:update', { projectPath, id: entry.id, ...patch })
      await queryClient.invalidateQueries({ queryKey: ['hazards:list'] })
    } catch (e) {
      toast.error('Could not update the snapshot', errorText(e))
    }
  }
  const remove = async () => {
    try {
      await call('hazards:delete', { projectPath, id: entry.id })
      await queryClient.invalidateQueries({ queryKey: ['hazards:list'] })
    } catch (e) {
      toast.error('Could not delete the snapshot', errorText(e))
    }
  }
  return (
    <tr>
      <th scope="row">{formatWhen(entry.fetchedAt)}</th>
      <td>
        <input
          className="input"
          aria-label={`Label for the snapshot of ${formatWhen(entry.fetchedAt)}`}
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label !== entry.label && void update({ label })}
        />
      </td>
      <td>
        {props.active ? (
          <Badge tone="ok">Used for ideas</Badge>
        ) : (
          <Button size="sm" onClick={() => void update({ active: true })}>
            Use for ideas
          </Button>
        )}
      </td>
      <td>
        <label className="row">
          <input
            type="checkbox"
            checked={entry.pinned}
            onChange={(e) => void update({ pinned: e.target.checked })}
          />
          <span>Pinned</span>
        </label>
      </td>
      <td className="row">
        <Button size="sm" onClick={props.onView} aria-pressed={props.viewing}>
          View
        </Button>
        <Button size="sm" variant="danger" onClick={() => void remove()}>
          Delete
        </Button>
      </td>
    </tr>
  )
}

function Snapshots(props: { projectPath: string; viewId: string; onView: (id: string) => void }) {
  const list = useIpcQuery('hazards:list', { projectPath: props.projectPath })
  const viewId = props.viewId || list.data?.active || list.data?.snapshots[0]?.id || ''
  const snapshot = useIpcQuery(
    'hazards:get',
    { projectPath: props.projectPath, id: viewId },
    { enabled: !!viewId },
  )
  const entries = list.data?.snapshots ?? []
  if (list.isPending) return <p className="muted">Loading the snapshots…</p>
  if (!entries.length)
    return (
      <EmptyState
        title="No hazard data yet"
        body="Press Fetch to save a dated snapshot for your area. Until then nothing has been requested."
      />
    )
  return (
    <>
      <table className="table">
        <caption className="sr-only">Saved hazard snapshots, newest first</caption>
        <thead>
          <tr>
            <th scope="col">Fetched</th>
            <th scope="col">Label</th>
            <th scope="col">Ideas</th>
            <th scope="col">Keep</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <SnapshotRow
              key={e.id}
              entry={e}
              active={list.data?.active === e.id}
              viewing={viewId === e.id}
              projectPath={props.projectPath}
              onView={() => props.onView(e.id)}
            />
          ))}
        </tbody>
      </table>
      {snapshot.data && <SnapshotView snapshot={snapshot.data} />}
      {snapshot.error && (
        <p className="field__error" role="alert">
          {errorText(snapshot.error)}
        </p>
      )}
    </>
  )
}

export default function HazardsPage() {
  const params = useParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const settings = useIpcQuery('hazards:settings', undefined)
  const plan = useIpcQuery('hazards:plan', { projectPath })
  const [fetchOpen, setFetchOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [viewId, setViewId] = useState('')
  const enabled = settings.data?.enabled ?? false
  const hasLocation = plan.data?.hasLocation ?? false
  return (
    <div className="page hazards-page">
      <PageHeader
        eyebrow="Context"
        title="Hazard context"
        description="Public weather, earthquake, fire and disaster-declaration information for your area, saved as a dated snapshot that ideas and scenarios can use."
        actions={
          enabled && hasLocation ? (
            <>
              <Button variant="primary" onClick={() => setFetchOpen(true)}>
                Fetch hazard data…
              </Button>
              <Button onClick={() => setImportOpen(true)}>Import layer file…</Button>
            </>
          ) : undefined
        }
      />
      <p className="hazard-note" role="note">
        {NOT_OPERATIONAL}
      </p>
      {settings.data && !enabled && (
        <EmptyState
          title="Hazard data is off"
          body="Nothing is fetched while it is off. You can turn it on in Settings, under Hazard data, where every service that would be contacted is listed."
          actions={<Link to="/settings">Open Settings</Link>}
        />
      )}
      {enabled && plan.data && !hasLocation && (
        <EmptyState
          title="Set the project location first"
          body="Choose a county or enter coordinates under Location in the project settings."
          actions={<Link to={`/p/${params.projectKey}`}>Open project settings</Link>}
        />
      )}
      {enabled && hasLocation && (
        <section className="card stack" aria-labelledby="hazard-snapshots">
          <h2 id="hazard-snapshots" className="section-title">
            Snapshots
          </h2>
          <Snapshots projectPath={projectPath} viewId={viewId} onView={setViewId} />
        </section>
      )}
      <FetchDialog
        projectPath={projectPath}
        open={fetchOpen}
        onOpenChange={setFetchOpen}
        onDone={(s) => {
          setViewId(s.id)
          toast.success('Hazard data saved', 'The snapshot is stored in this project.')
        }}
      />
      <ImportLayerDialog
        projectPath={projectPath}
        open={importOpen}
        onOpenChange={setImportOpen}
        onDone={setViewId}
      />
    </div>
  )
}
