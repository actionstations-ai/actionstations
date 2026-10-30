// Micro-drills on players' devices (#437, FR-17): the drills sent to the running live session
// and each participant's progress. A participant is a label ("Participant 1") and counts; the
// answers themselves are in the run files, read in the debrief. Closing a drill finishes every
// device's run and adds it to the program snapshot.
import type { LiveDrillView } from '@shared/schemas/live'
import { Badge, Button } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useLiveDrills } from './use-live-drills'
import { queryClient } from '../../lib/query'

function LiveDrill({ drill, projectPath }: { drill: LiveDrillView; projectPath: string }) {
  const close = async () => {
    try {
      await call('microdrills:live-close', { projectPath, liveId: drill.liveId })
      toast.success('Drill closed', 'Each device’s run is finished. Open the debriefs below.')
      await queryClient.invalidateQueries({ queryKey: ['microdrills:live-status'] })
      await queryClient.invalidateQueries({ queryKey: ['microdrills:runs'] })
    } catch (e) {
      toast.error('Could not close the drill', errorText(e))
    }
  }
  const open = drill.status === 'open'
  return (
    <li className="card stack micro-live">
      <div className="row">
        <h3 className="micro-card__title">{drill.title}</h3>
        <Badge tone={open ? 'ok' : 'neutral'}>{open ? 'Open' : 'Closed'}</Badge>
        {drill.assessment === 'checklist' && (
          <Badge tone="warn">Players tick the points (no model check)</Badge>
        )}
      </div>
      {drill.participants.length === 0 ? (
        <p className="muted">No one has answered yet.</p>
      ) : (
        <table className="table">
          <caption className="sr-only">Progress of each device in {drill.title}</caption>
          <thead>
            <tr>
              <th scope="col">Participant</th>
              <th scope="col">Connected</th>
              <th scope="col">Questions answered</th>
              <th scope="col">Hints used</th>
            </tr>
          </thead>
          <tbody>
            {drill.participants.map((p) => (
              <tr key={p.runId}>
                <th scope="row">{p.label}</th>
                <td>{p.online ? 'Yes' : 'No'}</td>
                <td>
                  {p.answered} of {drill.stepCount}
                </td>
                <td>{p.hints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open && (
        <div>
          <Button onClick={() => void close()}>Close the drill and finish every run</Button>
        </div>
      )}
    </li>
  )
}

export function DrillLivePanel({ projectPath }: { projectPath: string }) {
  const { running, drills } = useLiveDrills(projectPath)
  return (
    <section className="stack" aria-labelledby="micro-live-title">
      <h2 id="micro-live-title" className="section-title">
        On players’ devices
      </h2>
      {!running ? (
        <p className="muted">
          Start a live session in Facilitate to send a drill to players’ devices. Each player
          answers alone; answers reach this computer only.
        </p>
      ) : drills.length === 0 ? (
        <p className="muted">
          A live session is running. Choose Send to devices on a Ready drill below.
        </p>
      ) : (
        <ul className="micro-list">
          {drills.map((d) => (
            <LiveDrill key={d.liveId} drill={d} projectPath={projectPath} />
          ))}
        </ul>
      )}
    </section>
  )
}
