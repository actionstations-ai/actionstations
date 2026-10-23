// Optional follow-on jobs after generation (#227, Settings → Generation, off by default):
// when a scenario finishes generating, start "Write all injects"; when that job (one this
// component started) finishes, start "Render all media". Uses the same IPC as the deck buttons.
import type { JobDoneEvent } from '@shared/schemas/job'
import { toast } from '../../components/toast-store'
import { call, IpcError } from '../../lib/api'

type Starter = (projectPath: string, scenarioId: string) => Promise<{ jobId: string }>

const startInjects: Starter = (projectPath, scenarioId) =>
  call('generate:injects', { projectPath, scenarioId })
const startMedia: Starter = (projectPath, scenarioId) =>
  call('generate:media', { projectPath, scenarioId })

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Start a follow-on job; one retry when the finished job still holds the scenario. */
async function startFollowOn(start: Starter, projectPath: string, scenarioId: string) {
  try {
    return await start(projectPath, scenarioId)
  } catch (e) {
    if (!(e instanceof IpcError && e.code === 'CONFLICT')) throw e
    await wait(750)
    return start(projectPath, scenarioId)
  }
}

/** Decide and start the next job for a finished one; returns the started job id. */
export async function continueAfter(
  e: JobDoneEvent,
  autoStarted: Set<string>,
): Promise<string | undefined> {
  if (e.status !== 'done') {
    autoStarted.delete(e.jobId)
    return undefined
  }
  const fromInjects = e.kind === 'generate-injects' && autoStarted.delete(e.jobId)
  if (e.kind !== 'generate-scenario' && !fromInjects) return undefined
  const settings = await call('settings:get', undefined)
  if (!settings.generation?.autoInjectsAndMedia) return undefined
  const job = await call('jobs:get', { jobId: e.jobId })
  if (!job.projectPath || !job.scenarioId) return undefined
  const start = fromInjects ? startMedia : startInjects
  const { jobId } = await startFollowOn(start, job.projectPath, job.scenarioId)
  if (!fromInjects) autoStarted.add(jobId)
  toast.info(fromInjects ? 'Rendering media automatically' : 'Writing injects automatically')
  return jobId
}
