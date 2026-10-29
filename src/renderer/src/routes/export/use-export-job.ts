// The scenario's export job, from the global job store (#197): leaving the Export page and
// coming back shows the running export (progress, Cancel) or the one that finished meanwhile,
// and the Export button stays disabled while one runs, so no second export starts.
import { useCallback } from 'react'
import type { ExportTarget } from '@shared/ipc'
import type { JobDoneEvent } from '@shared/schemas/job'
import { call } from '../../lib/api'
import { latestJob, trackJob, useJobsStore } from '../../state/jobs'
import { useJob } from '../generate/use-job'

export function useExportJob(
  projectPath: string,
  scenarioId: string,
  onDone: (e: JobDoneEvent) => void,
) {
  const latest = useJobsStore((s) =>
    latestJob(
      s.jobs,
      (j) => j.kind === 'export' && j.projectPath === projectPath && j.scenarioId === scenarioId,
    ),
  )
  const jobId = latest?.id ?? null
  const job = useJob(jobId, onDone)
  const running = job?.status === 'queued' || job?.status === 'running'
  const run = useCallback(
    async (outDir: string, targets: ExportTarget[], surveyIds?: string[]) => {
      const { jobId: id } = await call('export:run', {
        projectPath,
        scenarioId,
        outDir,
        targets,
        ...(surveyIds?.length ? { surveyIds } : {}),
      })
      trackJob(id, { kind: 'export', projectPath, scenarioId, payload: { outDir, targets } })
      return id
    },
    [projectPath, scenarioId],
  )
  return { jobId, job, running, run }
}
