// Micro-drills (#437): 15-minute practice on one section of one plan, for one person or a small
// team around one screen. The library lists the drills and past runs; a drill is reviewed in the
// editor, run in the run view, and its debrief is read at the end. Results go to the program as
// a separate "practised" count, never as exercise coverage.
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { MICRO_DRILL_EVIDENCE_NOTE, type MicroDrillListItem } from '@shared/schemas'
import { Badge, Button, EmptyState, PageHeader } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { BuildPanel } from './BuildPanel'
import { DebriefView } from './DebriefView'
import { DrillLivePanel } from './DrillLivePanel'
import { MicroDrillEditor } from './MicroDrillEditor'
import { RunView } from './RunView'
import { sendDrillToDevices, useLiveDrills } from './use-live-drills'
import './microdrills.css'

function DrillCard(props: {
  drill: MicroDrillListItem
  projectPath: string
  onOpen: (view: 'edit' | 'run') => void
  /** A live session runs, so the drill can go to players' devices. */
  canSend: boolean
}) {
  const { drill, projectPath } = props
  const [confirming, setConfirming] = useState(false)
  const remove = async () => {
    try {
      await call('microdrills:delete', { projectPath, id: drill.id })
    } catch (e) {
      toast.error('Could not delete', errorText(e))
    }
  }
  const removeNames = async () => {
    try {
      const r = await call('microdrills:remove-names', { projectPath, id: drill.id })
      toast.success(
        'Names removed',
        `${r.removed} ${r.removed === 1 ? 'name' : 'names'} taken off the runs.`,
      )
    } catch (e) {
      toast.error('Could not remove names', errorText(e))
    }
  }
  return (
    <li className="card micro-card">
      <h3 className="micro-card__title">{drill.title}</h3>
      <p className="muted">
        {drill.annex.documentTitle} › {drill.annex.headingPath}
      </p>
      <p className="row">
        <Badge tone={drill.status === 'ready' ? 'ok' : 'neutral'}>
          {drill.status === 'ready' ? 'Ready' : 'Draft'}
        </Badge>
        {drill.lintIssues > 0 && (
          <Badge tone="warn">
            {drill.lintIssues} {drill.lintIssues === 1 ? 'problem' : 'problems'}
          </Badge>
        )}
        <span className="muted">
          {drill.durationMin} minutes · {drill.mode === 'team' ? 'team' : 'one person'} ·{' '}
          {drill.runs} {drill.runs === 1 ? 'run' : 'runs'}
        </span>
      </p>
      <div className="row micro-card__actions">
        <Button
          variant="primary"
          disabled={drill.status !== 'ready'}
          onClick={() => props.onOpen('run')}
        >
          Run
        </Button>
        {props.canSend && (
          <Button
            disabled={drill.status !== 'ready'}
            onClick={() => void sendDrillToDevices(projectPath, drill.id)}
          >
            Send to devices
          </Button>
        )}
        <Button onClick={() => props.onOpen('edit')}>Review and edit</Button>
        <Button onClick={() => void removeNames()}>Remove names from runs</Button>
        {confirming ? (
          <>
            <Button variant="danger" onClick={() => void remove()}>
              Delete the drill and its runs
            </Button>
            <Button onClick={() => setConfirming(false)}>Keep it</Button>
          </>
        ) : (
          <Button onClick={() => setConfirming(true)}>Delete…</Button>
        )}
      </div>
    </li>
  )
}

function RunsTable(props: { projectPath: string; onDebrief: (runId: string) => void }) {
  const runs = useIpcQuery('microdrills:runs', { projectPath: props.projectPath })
  const done = (runs.data ?? []).filter((r) => r.finishedAt)
  if (!done.length) return null
  return (
    <section className="card stack" aria-labelledby="micro-runs-title">
      <h2 id="micro-runs-title" className="section-title">
        Past runs
      </h2>
      <table className="table">
        <caption className="sr-only">Finished micro-drill runs, newest first</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Drill</th>
            <th scope="col">People</th>
            <th scope="col">Points covered</th>
            <th scope="col">Hints used</th>
            <th scope="col">
              <span className="sr-only">Debrief</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {done.map((r) => (
            <tr key={r.id}>
              <td>{r.startedAt.slice(0, 10)}</td>
              <td>{r.drillTitle}</td>
              <td>{r.participants.length}</td>
              <td>{Math.round((r.coverage ?? 0) * 100)}%</td>
              <td>{r.steps.reduce((n, s) => n + s.hintsUsed.length, 0)}</td>
              <td>
                <Button size="sm" onClick={() => props.onDebrief(r.id)}>
                  Debrief
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export default function MicroDrillsPage() {
  const params = useParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const [search, setSearch] = useSearchParams()
  const view = search.get('view') ?? 'library'
  const drillId = search.get('drill') ?? ''
  const runId = search.get('run') ?? ''
  const list = useIpcQuery('microdrills:list', { projectPath })
  const live = useLiveDrills(projectPath)
  const go = (next: Record<string, string>) => setSearch(next)
  const back = () => setSearch({})

  if (view === 'edit' && drillId)
    return <MicroDrillEditor projectPath={projectPath} drillId={drillId} onClose={back} />
  if (view === 'run' && drillId)
    return (
      <RunView
        projectPath={projectPath}
        drillId={drillId}
        onFinished={(id) => go({ view: 'debrief', run: id })}
        onClose={back}
      />
    )
  if (view === 'debrief' && runId)
    return <DebriefView projectPath={projectPath} runId={runId} onClose={back} />

  return (
    <div className="page micro-page">
      <PageHeader
        eyebrow="Practice"
        title="Micro-drills"
        description="Fifteen minutes on one section of one plan, for one person or a small team around one screen. A facilitator checks each answer against the plan and offers hints that fade as people improve."
      />
      <p className="micro-note" role="note">
        {MICRO_DRILL_EVIDENCE_NOTE}
      </p>
      <BuildPanel projectPath={projectPath} onBuilt={(id) => go({ view: 'edit', drill: id })} />
      <DrillLivePanel projectPath={projectPath} />
      <section aria-labelledby="micro-library-title" className="stack">
        <h2 id="micro-library-title" className="section-title">
          Your drills
        </h2>
        {list.isPending ? (
          <p className="muted">Loading the drills…</p>
        ) : (list.data ?? []).length === 0 ? (
          <EmptyState
            title="No drills yet"
            body="Build one above from a section of a plan you have imported."
          />
        ) : (
          <ul className="micro-list">
            {(list.data ?? []).map((d) => (
              <DrillCard
                key={d.id}
                drill={d}
                projectPath={projectPath}
                canSend={live.running}
                onOpen={(v) => go({ view: v, drill: d.id })}
              />
            ))}
          </ul>
        )}
      </section>
      <RunsTable projectPath={projectPath} onDebrief={(id) => go({ view: 'debrief', run: id })} />
    </div>
  )
}
