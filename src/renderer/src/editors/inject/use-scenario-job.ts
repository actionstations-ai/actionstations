// The generation job (if any) that currently owns a scenario. Only one runs per scenario
// (#98): while it does, saves answer CONFLICT. Reattaches on mount (jobs:list), follows
// progress events (including which inject is being worked on) and reports when it settles.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { JobDoneEvent, JobKind, JobStatus } from '@shared/schemas/job'
import { call, subscribe } from '../../lib/api'

export interface ScenarioJob {
  jobId: string
  kind: JobKind
  status: JobStatus
  progress: number
  message: string
  /** Item ids (inject or row ids) in the order the job reached them; the last is current. */
  items: string[]
}

const ACTIVE: JobStatus[] = ['queued', 'running', 'paused']

function withItem(items: string[], itemId: string | undefined): string[] {
  if (!itemId || items.at(-1) === itemId) return items
  return [...items.filter((i) => i !== itemId), itemId]
}

export function useScenarioJob(
  projectPath: string,
  scenarioId: string,
  onDone?: (e: JobDoneEvent) => void,
) {
  const [job, setJob] = useState<ScenarioJob | null>(null)
  /** jobId → whether it belongs to this scenario (looked up once per job). */
  const owners = useRef(new Map<string, Promise<boolean>>())
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  }, [onDone])

  const ownsJob = useCallback(
    (jobId: string): Promise<boolean> => {
      let known = owners.current.get(jobId)
      if (!known) {
        known = call('jobs:get', { jobId })
          .then((j) => j.scenarioId === scenarioId && j.projectPath === projectPath)
          .catch(() => false)
        owners.current.set(jobId, known)
      }
      return known
    },
    [projectPath, scenarioId],
  )

  useEffect(() => {
    let live = true
    void call('jobs:list', { projectPath, activeOnly: true })
      .then((jobs) => {
        const mine = jobs.find((j) => j.scenarioId === scenarioId && ACTIVE.includes(j.status))
        if (!mine || !live) return
        owners.current.set(mine.id, Promise.resolve(true))
        setJob({
          jobId: mine.id,
          kind: mine.kind,
          status: mine.status,
          progress: mine.progress,
          message: mine.message,
          items: [],
        })
      })
      .catch(() => undefined)
    const offs = [
      subscribe('job:progress', (e) => {
        void ownsJob(e.jobId).then((mine) => {
          if (!mine || !live || !ACTIVE.includes(e.status)) return
          setJob((j) => ({
            jobId: e.jobId,
            kind: e.kind,
            status: e.status,
            progress: e.progress,
            message: e.message,
            items: withItem(j?.jobId === e.jobId ? j.items : [], e.itemId),
          }))
        })
      }),
      subscribe('job:done', (e) => {
        void ownsJob(e.jobId).then((mine) => {
          if (!mine || !live) return
          setJob((j) => (j?.jobId === e.jobId || !j ? null : j))
          doneRef.current?.(e)
        })
      }),
    ]
    return () => {
      live = false
      offs.forEach((off) => off())
    }
  }, [projectPath, scenarioId, ownsJob])

  /** Register a job the caller just started (before its first progress event arrives). */
  const track = useCallback((jobId: string, kind: JobKind) => {
    owners.current.set(jobId, Promise.resolve(true))
    setJob({ jobId, kind, status: 'queued', progress: 0, message: 'Queued', items: [] })
  }, [])

  return { job, track }
}
