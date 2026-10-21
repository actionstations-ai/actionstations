import { useCallback, useEffect, useRef, useState } from 'react'
import type { Job } from '@shared/schemas/job'
import { call, subscribe } from '../../lib/api'
import { applyProgress, applyToken, emptyLog, seedFromJob, type LiveLog } from './live-log'

async function loadRecorded(jobId: string): Promise<LiveLog | null> {
  try {
    const [job, recorded] = await Promise.all([
      call('jobs:get', { jobId }),
      call('jobs:log', { jobId }),
    ])
    return seedFromJob(job, recorded)
  } catch {
    return null
  }
}

async function findRunningJob(projectPath: string, scenarioId: string): Promise<Job | null> {
  try {
    const jobs = await call('jobs:list', { projectPath, activeOnly: true })
    return jobs.find((j) => j.scenarioId === scenarioId) ?? null
  } catch {
    return null
  }
}

/**
 * Live log for one scenario. On mount it reattaches to a running job for this scenario
 * (jobs:list + jobs:log), or to `initialJobId` when the caller just started one.
 * `follow(jobId)` switches to a newly started job (re-run, continue).
 */
export function useLiveLog(projectPath: string, scenarioId: string, initialJobId?: string) {
  const [log, setLog] = useState<LiveLog>(() => emptyLog(initialJobId ?? null))
  const current = useRef<string | null>(initialJobId ?? null)

  const follow = useCallback(async (jobId: string) => {
    current.current = jobId
    setLog((l) => (l.jobId === jobId ? l : emptyLog(jobId)))
    const seeded = await loadRecorded(jobId)
    if (seeded && current.current === jobId) setLog(seeded)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (initialJobId) return follow(initialJobId)
      const job = await findRunningJob(projectPath, scenarioId)
      if (job && !cancelled) await follow(job.id)
    })()
    return () => {
      cancelled = true
    }
  }, [projectPath, scenarioId, initialJobId, follow])

  useEffect(() => {
    const offs = [
      subscribe('job:progress', (e) => setLog((l) => applyProgress(l, e))),
      subscribe('job:token', (e) => setLog((l) => applyToken(l, e))),
      subscribe('job:done', (e) =>
        setLog((l) =>
          l.jobId === e.jobId
            ? { ...l, status: e.status, ...(e.status === 'done' ? { progress: 1 } : {}) }
            : l,
        ),
      ),
    ]
    return () => offs.forEach((off) => off())
  }, [])

  return { log, follow }
}
