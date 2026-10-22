// Inject jobs own their scenario the way pipeline jobs do (scenario/busy, #90): a second
// generation job, or an editor save, gets CONFLICT while the job runs instead of being
// overwritten by the next checkpoint. The claim is released when the job settles.
import type { Job, JobKind } from '@shared/schemas'
import { jobs as defaultJobs, type JobContext, type JobManager } from '../../jobs/manager'
import { newId } from '../../lib/ids'
import { claimScenario } from '../../scenario/busy'

export type InjectJobKind = Extract<
  JobKind,
  'generate-injects' | 'render-media' | 'repair-scenario'
>

/** Start a job that owns `scenarioId` until it settles; CONFLICT when another job owns it. */
export function startInjectJob(
  kind: InjectJobKind,
  root: string,
  scenarioId: string,
  run: (ctx: JobContext) => Promise<unknown>,
  payload?: unknown,
  manager: JobManager = defaultJobs,
): Job {
  const release = claimScenario(root, scenarioId, newId())
  try {
    return manager.start(kind, run, {
      projectPath: root,
      scenarioId,
      ...(payload !== undefined ? { payload } : {}),
      onSettled: release,
    })
  } catch (err) {
    release()
    throw err
  }
}

export { assertNotGenerating } from '../../scenario/busy'
