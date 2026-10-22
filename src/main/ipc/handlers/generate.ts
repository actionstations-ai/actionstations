// Generation handlers (#25/#26/#27). generate:injects and generate:media land with M3 (#34).
import type { ScenarioBrief, ScenarioIdea } from '@shared/schemas'
import { defineHandlers } from '../registry'
import { pipelineDeps } from '../../generate/deps'
import { PIPELINE_STAGES } from '../../generate/engine'
import { generateIdeas, readIdeas, rememberIdea, saveScenarioIdea } from '../../generate/ideas'
import { continueJob, registerScenarioResumers, rerunJob } from '../../generate/scenario-jobs'
import { jobs } from '../../jobs/manager'
import { AppError } from '../../lib/errors'
import { requireProject } from '../../project/guard'

/** Interrupted pipeline / re-run jobs resume as the same work (generate/scenario-jobs). */
registerScenarioResumers()

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
    if (idea) await saveScenarioIdea(root, scenario.id, idea)
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
    const job = rerunJob(root, scenarioId, {
      stage,
      ...(itemId ? { itemId } : {}),
      ...(instructions ? { instructions } : {}),
    })
    return { jobId: job.id }
  },
})
