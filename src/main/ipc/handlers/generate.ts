// Generation handlers (#25/#26/#27). generate:injects and generate:media land with M3 (#34).
import type { Job, ScenarioBrief, ScenarioIdea } from '@shared/schemas'
import { defineHandlers } from '../registry'
import { pipelineDeps } from '../../generate/deps'
import { PIPELINE_STAGES, rerunStep, runPipeline, type StepKey } from '../../generate/engine'
import { generateIdeas, readIdeas, rememberIdea } from '../../generate/ideas'
import { jobs } from '../../jobs/manager'
import { AppError } from '../../lib/errors'
import { requireProject } from '../../project/guard'

const continueJob = (root: string, scenarioId: string): Job =>
  jobs.start('generate-scenario', (ctx) => runPipeline(root, scenarioId, ctx), {
    projectPath: root,
    scenarioId,
    resumable: true,
  })

/** A scenario pipeline interrupted by an app exit picks up from its last checkpoint. */
jobs.registerResumer('generate-scenario', async (paused) =>
  continueJob(await requireProject(paused.projectPath!), paused.scenarioId!),
)
jobs.registerResumer('rerun-stage', async (paused) =>
  continueJob(await requireProject(paused.projectPath!), paused.scenarioId!),
)

function scenarioTitle(brief: ScenarioBrief, idea?: ScenarioIdea): string {
  if (idea?.title) return idea.title
  const firstLine = brief.userPrompt.split(/\r?\n/)[0]?.trim() ?? ''
  return firstLine.slice(0, 80) || 'Untitled scenario'
}

export default defineHandlers({
  'generate:ideas': async ({ projectPath, brief, count }) => {
    const root = await requireProject(projectPath)
    const job = jobs.start('ideate', (ctx) => generateIdeas(root, { brief, count }, ctx), {
      projectPath: root,
      payload: { count },
    })
    return { jobId: job.id }
  },
  'generate:ideas-result': async ({ projectPath }) => readIdeas(await requireProject(projectPath)),
  'generate:scenario': async ({ projectPath, brief, idea }) => {
    const root = await requireProject(projectPath)
    if (idea) await rememberIdea(root, idea)
    const deps = await pipelineDeps()
    const scenario = await deps.store.createScenario(root, {
      title: scenarioTitle(brief, idea),
      brief: { ...brief, ...(idea ? { ideaId: idea.id } : {}) },
    })
    return { jobId: continueJob(root, scenario.id).id, scenarioId: scenario.id }
  },
  'generate:continue': async ({ projectPath, scenarioId }) => {
    const root = await requireProject(projectPath)
    return { jobId: continueJob(root, scenarioId).id }
  },
  'generate:rerun-stage': async ({ projectPath, scenarioId, stage, itemId, instructions }) => {
    const root = await requireProject(projectPath)
    if (!PIPELINE_STAGES.includes(stage)) {
      throw new AppError('VALIDATION', `Stage ${stage} is not part of the scenario pipeline`)
    }
    if (stage === 'msel_phase' && !itemId) {
      throw new AppError('VALIDATION', 'msel_phase needs the phase id as itemId')
    }
    const step: StepKey = { stage, ...(itemId ? { itemId } : {}) }
    const job = jobs.start(
      'rerun-stage',
      (ctx) => rerunStep(root, scenarioId, step, instructions, ctx),
      { projectPath: root, scenarioId, payload: { stage, itemId, instructions }, resumable: true },
    )
    return { jobId: job.id }
  },
})
