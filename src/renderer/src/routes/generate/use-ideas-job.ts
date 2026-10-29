// The "Give me ideas" job of a project, for the ideas panel.
import { useState } from 'react'
import { call, type IpcError } from '../../lib/api'
import { queryClient } from '../../lib/query'
import { isRunning, latestJob, trackJob, useJobsStore } from '../../state/jobs'
import { useJob } from './use-job'

type ErrorLike = { code?: string; message: string }

/**
 * The project's idea job: started here, or reattached after navigating away (#197). The
 * error is set when the job fails or is cancelled, or when it cannot start.
 */
export function useIdeasJob(projectPath: string) {
  const [started, setStarted] = useState<string | null>(null)
  const reattached = useJobsStore((s) =>
    latestJob(s.jobs, (j) => j.kind === 'ideate' && j.projectPath === projectPath && isRunning(j)),
  )
  const jobId = started ?? reattached?.id ?? null
  // Keep following it once it finishes (it then drops out of the "running" lookup).
  if (!started && reattached) setStarted(reattached.id)
  const [error, setError] = useState<ErrorLike | null>(null)
  const job = useJob(jobId, (e) => {
    if (e.status === 'error') setError({ message: e.error ?? 'Idea generation failed' })
    if (e.status === 'cancelled')
      setError({ code: 'CANCELLED', message: 'Idea generation was cancelled' })
    void queryClient.invalidateQueries({ queryKey: ['generate:ideas-result'] })
  })
  const running = job?.status === 'queued' || job?.status === 'running'

  /**
   * Ask for `count` ideas (clamped to 1–12, default 6), optionally around a focus and, with
   * `fromSeams`, around the open plan conflicts (#427).
   */
  const request = async (focus: string, count: string, fromSeams = false) => {
    setError(null)
    try {
      const n = Math.min(12, Math.max(1, Math.round(Number(count)) || 6))
      const { jobId: id } = await call('generate:ideas', {
        projectPath,
        brief: focus.trim() ? { userPrompt: focus.trim() } : {},
        count: n,
        fromSeams,
      })
      trackJob(id, { kind: 'ideate', projectPath, payload: { count: n } })
      setStarted(id)
    } catch (err) {
      setError(err as IpcError)
    }
  }
  return { jobId, job, running, error, request }
}
