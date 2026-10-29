// Starting and resuming scenario pipeline jobs (#90). At most one generation job owns a
// scenario at a time (scenario/busy): a second job, or an editor save, gets CONFLICT instead of
// being overwritten by the pipeline's next checkpoint. Resumers rebuild the same kind of job.
import { z } from 'zod'
import { Stage, type Job } from '@shared/schemas'
import { jobs as defaultJobs, type JobContext, type JobManager } from '../jobs/manager'
import { AppError } from '../lib/errors'
import { newId } from '../lib/ids'
import { requireProject } from '../project/guard'
import { claimScenario } from '../scenario/busy'
import { rerunStep, runPipeline, type StepKey } from './engine'

type ScenarioJobKind = 'generate-scenario' | 'rerun-stage' | 'draft-aar'

/** Start a job that owns `scenarioId` until it settles; CONFLICT when another job owns it. */
export function startScenarioJob(
  kind: ScenarioJobKind,
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
      resumable: true,
      ...(payload !== undefined ? { payload } : {}),
      onSettled: release,
    })
  } catch (err) {
    release()
    throw err
  }
}

/** Run (or continue) the pipeline: every step without an ok run. */
export const continueJob = (root: string, scenarioId: string): Job =>
  startScenarioJob('generate-scenario', root, scenarioId, (ctx) =>
    runPipeline(root, scenarioId, ctx),
  )

export const RerunPayload = z.object({
  stage: Stage,
  itemId: z.string().optional(),
  instructions: z.string().optional(),
})
export type RerunPayload = z.infer<typeof RerunPayload>

/** Re-run one step with the designer's instructions; the payload is what a resume replays. */
export function rerunJob(root: string, scenarioId: string, payload: RerunPayload): Job {
  const step: StepKey = {
    stage: payload.stage,
    ...(payload.itemId ? { itemId: payload.itemId } : {}),
  }
  return startScenarioJob(
    'rerun-stage',
    root,
    scenarioId,
    (ctx) => rerunStep(root, scenarioId, step, payload.instructions, ctx),
    payload,
  )
}

/**
 * Jobs interrupted by an app exit resume as the same work: the pipeline continues from its
 * last checkpoint; a re-run replays the same step with the same instructions (a re-run writes
 * nothing until it succeeds, so replaying it is safe).
 */
export function registerScenarioResumers(manager: JobManager = defaultJobs): void {
  manager.registerResumer('generate-scenario', async (paused) =>
    continueJob(await requireProject(paused.projectPath!), paused.scenarioId!),
  )
  manager.registerResumer('rerun-stage', async (paused) => {
    const payload = RerunPayload.safeParse(paused.payload)
    if (!payload.success) {
      throw new AppError('VALIDATION', `Job ${paused.id} has no re-run step to resume`)
    }
    return rerunJob(await requireProject(paused.projectPath!), paused.scenarioId!, payload.data)
  })
}
