// "Give me ideas": the ideate stage over the project's hazard appendices / checklists /
// failure modes. Results live in <project>/ideas.json; the idea a scenario was started from is
// snapshotted in scenarios/<id>/idea.json, so resumes and re-runs see it as the designer chose
// it even after the next ideate run rewrites ideas.json.
import { z } from 'zod'
import { ScenarioIdea, type IdeasOutput, type ScenarioBrief } from '@shared/schemas'
import type { JobContext } from '../jobs/manager'
import { exists, readJson, readJsonOr, writeJsonAtomic } from '../lib/fs'
import { nowIso } from '../lib/ids'
import { projectPaths } from '../project/store'
import { scenarioLayout } from '../scenario/layout'
import { pipelineDeps } from './deps'
import { facilitySheet } from './facility'
import { mapIdeas } from './mappers'
import { runStage } from './stage'
import { projectVars, taxonomyVars } from './vars'

const IdeasFile = z.object({
  generatedAt: z.string(),
  ideas: z.array(ScenarioIdea).default([]),
})
type IdeasFile = z.infer<typeof IdeasFile>

export async function readIdeas(root: string): Promise<ScenarioIdea[]> {
  const file = await readJsonOr(projectPaths(root).ideas, IdeasFile, () => ({
    generatedAt: nowIso(),
    ideas: [],
  }))
  return file.ideas
}

export async function writeIdeas(root: string, ideas: ScenarioIdea[]): Promise<void> {
  const value: IdeasFile = { generatedAt: nowIso(), ideas }
  await writeJsonAtomic(projectPaths(root).ideas, value)
}

/** Keep ideas.json current with an idea handed in with generate:scenario (edits win). */
export async function rememberIdea(root: string, idea: ScenarioIdea): Promise<void> {
  const ideas = await readIdeas(root)
  const at = ideas.findIndex((i) => i.id === idea.id)
  await writeIdeas(root, at >= 0 ? ideas.map((i, n) => (n === at ? idea : i)) : [idea, ...ideas])
}

/**
 * Snapshot the chosen idea inside the scenario folder. ideas.json is rewritten by every ideate
 * run; the snapshot is what a paused or re-run scenario reads.
 */
export async function saveScenarioIdea(
  root: string,
  scenarioId: string,
  idea: ScenarioIdea,
): Promise<void> {
  await writeJsonAtomic(scenarioLayout(root, scenarioId).idea, ScenarioIdea.parse(idea))
}

/** The scenario's idea snapshot, else (older scenarios) the idea in ideas.json by id. */
export async function findIdea(
  root: string,
  scenarioId: string,
  ideaId?: string,
): Promise<ScenarioIdea | undefined> {
  const file = scenarioLayout(root, scenarioId).idea
  if (await exists(file)) {
    const snap = await readJson(file, ScenarioIdea).catch(() => undefined)
    if (snap) return snap
  }
  if (!ideaId) return undefined
  return (await readIdeas(root)).find((i) => i.id === ideaId)
}
export interface IdeasRequest {
  brief: Partial<ScenarioBrief>
  count: number
}

/** Run the ideate stage and persist the ideas. Returns them for the job result. */
export async function generateIdeas(
  root: string,
  req: IdeasRequest,
  ctx: JobContext,
): Promise<ScenarioIdea[]> {
  const deps = await pipelineDeps()
  const [project, index] = await Promise.all([deps.loadProject(root), deps.openIndex(root)])
  const facility = await deps.loadFacilityFacts(root, project)
  ctx.progress(0.05, 'Reading the plans for scenario hooks', { stage: 'ideate' })
  const result = await runStage<IdeasOutput>({
    stage: 'ideate',
    projectPath: root,
    vars: {
      project: projectVars(project),
      brief: req.brief,
      count: req.count,
      taxonomy: taxonomyVars,
      facility: facilitySheet(facility),
      instructions: '',
    },
    ctx,
    deps,
    index,
  })
  const { ideas, dropped } = mapIdeas(result.output, result.retrieved)
  for (const d of dropped)
    ctx.log(`Idea "${d.rowId}" cited unknown keys ${d.keys.join(', ')}; dropped`, 'warn', {
      stage: 'ideate',
    })
  const kept = ideas.slice(0, req.count)
  await writeIdeas(root, kept)
  ctx.progress(1, `${kept.length} ideas`, { stage: 'ideate' })
  ctx.log(
    `ideate: ${kept.length} ideas, ${result.run.inputTokens ?? 0} in / ${result.run.outputTokens ?? 0} out tokens`,
    'info',
    { stage: 'ideate' },
  )
  return kept
}
