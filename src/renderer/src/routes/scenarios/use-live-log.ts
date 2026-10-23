import { useCallback, useEffect, useRef, useState } from 'react'
import { call, subscribe } from '../../lib/api'
import { interruptedJob, isRunning, scenarioOwner, useJobsStore } from '../../state/jobs'
import { useJobsConnection } from '../../state/use-jobs'
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

/**
 * Live log for one scenario. It follows `initialJobId` when the caller just started one, and
 * otherwise the scenario's job from the global job store (#197): the running one, or one an
 * app exit interrupted. Any job that starts for the scenario later (re-run, continue, resume,
 * repair, inject jobs) is followed as it starts; `follow(jobId)` switches explicitly.
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

  useJobsConnection()
  const running = useJobsStore((s) => scenarioOwner(s.jobs, projectPath, scenarioId))
  const interrupted = useJobsStore((s) => interruptedJob(s.jobs, projectPath, scenarioId))
  const target = running ?? interrupted

  useEffect(() => {
    void (async () => {
      if (initialJobId) await follow(initialJobId)
    })()
  }, [initialJobId, follow])

  // A job that starts for the scenario takes over the log; an interrupted one only fills an
  // empty log (it must not replace the log of a job that just finished).
  const targetId = target?.id
  const targetRunning = isRunning(target)
  useEffect(() => {
    if (!targetId || targetId === current.current) return
    if (!targetRunning && current.current) return
    void (async () => {
      await follow(targetId)
    })()
  }, [targetId, targetRunning, follow])

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
