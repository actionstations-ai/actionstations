// Provenance of the hazard data a scenario was written with (#439, #506): which dated snapshot,
// where each source's data came from and when it was accessed. Read from the project's snapshot,
// so it works offline. Shown in the scenario's Advanced information.
import { Link } from 'react-router'
import { useIpcQuery } from '../../lib/query'
import { projectKey } from '../../state/project'
import { NOT_OPERATIONAL, SOURCE_LABEL, STATUS_TEXT, formatWhen } from '../hazards/hazard-view'
import './hazard-provenance.css'

const place = (lat: number, lon: number): string => `${lat.toFixed(2)}, ${lon.toFixed(2)}`

export function HazardProvenance(props: { projectPath: string; snapshotId: string | undefined }) {
  const snapshot = useIpcQuery(
    'hazards:get',
    { projectPath: props.projectPath, id: props.snapshotId ?? '' },
    { enabled: !!props.snapshotId },
  )
  if (!props.snapshotId) return null
  const s = snapshot.data
  return (
    <section className="hazard-provenance" aria-labelledby="hazard-provenance-title">
      <h3 id="hazard-provenance-title">Hazard context</h3>
      {snapshot.isPending && <p className="muted">Loading the hazard snapshot…</p>}
      {snapshot.isError && (
        <p className="muted">
          This scenario used a hazard snapshot that is no longer in the project (it may have been
          deleted).
        </p>
      )}
      {s && (
        <>
          <p>
            Snapshot of {formatWhen(s.fetchedAt)}
            {s.label ? ` (${s.label})` : ''}, for {place(s.request.lat, s.request.lon)}.{' '}
            <Link to={`/p/${projectKey(props.projectPath)}/hazards`}>Open hazard context</Link>
          </p>
          <table className="table">
            <caption className="sr-only">Sources of the hazard snapshot</caption>
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Result</th>
                <th scope="col">Accessed</th>
                <th scope="col">Credit</th>
              </tr>
            </thead>
            <tbody>
              {s.sources.map((r, i) => (
                <tr key={`${r.id}-${i}`}>
                  <th scope="row">{SOURCE_LABEL[r.id]}</th>
                  <td>{STATUS_TEXT[r.status]}</td>
                  <td>{formatWhen(r.accessedAt)}</td>
                  <td>{r.attribution}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">{NOT_OPERATIONAL}</p>
        </>
      )}
    </section>
  )
}
