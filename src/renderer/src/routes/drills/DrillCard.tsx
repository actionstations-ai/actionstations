// One regression drill (#431): what it replays, whether the plans it expects were updated,
// the scenario built from it, and its recorded runs.
import { useState } from 'react'
import { Link } from 'react-router'
import type { Drill } from '@shared/schemas'
import { Badge, Button } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { projectKey } from '../../state/project'
import { useActiveProgram } from '../../state/program'
import { useJobSettled, useTrackedJob } from '../../state/use-jobs'
import { RunsTable } from './RunsTable'

export function DrillCard(props: { drill: Drill; projectPath: string }) {
  const { drill, projectPath } = props
  const base = `/p/${projectKey(projectPath)}/scenarios`
  const docs = useIpcQuery('documents:list', { projectPath })
  const scenarios = useIpcQuery('scenarios:list', { projectPath })
  const aar = useIpcQuery('aar:get', { projectPath, scenarioId: drill.sourceScenarioId })
  const { programPath } = useActiveProgram()
  const [jobId, setJobId] = useState<string | null>(null)
  const job = useTrackedJob(jobId)
  useJobSettled(
    (j) => j.id === jobId,
    (e, j) => {
      if (e.status === 'error') toast.error('Could not build the drill', j.error ?? '')
    },
  )
  const building = !!job && (job.status === 'running' || job.status === 'queued')
  const source = scenarios.data?.find((s) => s.id === drill.sourceScenarioId)

  const labels = new Map<string, string>()
  for (const c of aar.data?.capabilities ?? [])
    for (const f of c.areasForImprovement)
      for (const a of f.correctiveActions) labels.set(a.programActionId ?? a.id, a.action)
  const actionLabel = (id: string) => (labels.get(id) ?? id).slice(0, 60)

  const updated = drill.expectedDocumentIds.map((id) => ({
    id,
    newer: docs.data?.find((d) => d.supersedesDocumentId === id),
  }))
  const act = async (what: () => Promise<unknown>, fail: string) => {
    try {
      await what()
    } catch (e) {
      toast.error(fail, errorText(e))
    }
  }
  const build = () =>
    act(async () => {
      setJobId((await call('drills:build-scenario', { projectPath, id: drill.id })).jobId)
    }, 'Could not build the drill')
  const record = () =>
    act(async () => {
      await call('drills:record-run', { projectPath, id: drill.id })
      toast.success('Run recorded', 'It is in the table below.')
    }, 'Could not record the run')
  const toProgram = (runId: string) =>
    act(async () => {
      await call('drills:record-program', {
        projectPath,
        id: drill.id,
        runId,
        programPath: programPath!,
      })
      toast.success('Recorded in the program', 'The corrective actions have the result.')
    }, 'Could not write to the program')
  const exportResults = () =>
    act(async () => {
      const outDir = await call('dialog:open-directory', { title: 'Where should the results go?' })
      if (!outDir) return
      await call('drills:export-results', { projectPath, id: drill.id, outDir })
      toast.success('Exporting results', outDir)
    }, 'Could not export')
  const remove = () =>
    act(async () => {
      await call('drills:delete', { projectPath, id: drill.id })
    }, 'Could not delete')

  return (
    <li className="card drill" aria-label={drill.title}>
      <h2 className="drill__title">{drill.title}</h2>
      <p className="muted">
        From {source?.title ?? 'a scenario'} · {drill.rowIds.length}{' '}
        {drill.rowIds.length === 1 ? 'inject' : 'injects'} ({drill.rowIds.join(', ')}) ·{' '}
        {drill.criterionIds.length} {drill.criterionIds.length === 1 ? 'criterion' : 'criteria'} ·{' '}
        {drill.correctiveActionIds.length} corrective{' '}
        {drill.correctiveActionIds.length === 1 ? 'action' : 'actions'} · {drill.redlineIds.length}{' '}
        {drill.redlineIds.length === 1 ? 'redline' : 'redlines'}
      </p>
      {updated.length > 0 && (
        <ul className="drill__plans" aria-label="Plans the drill expects to be updated">
          {updated.map((u) => (
            <li key={u.id}>
              {docs.data?.find((d) => d.id === u.id)?.title ?? 'A plan'}:{' '}
              {u.newer ? (
                <Badge tone="ok">Updated: {u.newer.title}</Badge>
              ) : (
                <Badge tone="warn">Not updated yet</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="row drill__actions">
        <Button
          size="sm"
          variant={drill.drillScenarioId ? 'default' : 'primary'}
          disabled={building}
          onClick={() => void build()}
        >
          {building
            ? 'Building…'
            : drill.drillScenarioId
              ? 'Rebuild drill scenario'
              : 'Build drill scenario'}
        </Button>
        {drill.drillScenarioId && (
          <>
            <Link className="btn btn--sm" to={`${base}/${drill.drillScenarioId}`}>
              Open
            </Link>
            <Link className="btn btn--sm" to={`${base}/${drill.drillScenarioId}/facilitate`}>
              Facilitate
            </Link>
            <Button size="sm" onClick={() => void record()}>
              Record run
            </Button>
          </>
        )}
        {drill.runs.length > 0 && (
          <Button size="sm" onClick={() => void exportResults()}>
            Export results
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => void remove()}>
          Delete drill
        </Button>
      </div>
      <h3 className="section-title">Runs</h3>
      <RunsTable
        drill={drill}
        actionLabel={actionLabel}
        onRecordInProgram={
          programPath && drill.correctiveActionIds.length ? (id) => void toProgram(id) : undefined
        }
      />
    </li>
  )
}
