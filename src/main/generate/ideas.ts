// "Give me ideas": the ideate stage over the project's hazard appendices / checklists /
// failure modes. Results live in <project>/ideas.json; the idea a scenario was started from is
// snapshotted in scenarios/<id>/idea.json, so resumes and re-runs see it as the designer chose
// it even after the next ideate run rewrites ideas.json.
import { z } from 'zod'
import { threatFamily } from '@shared/domains'
import {
  GroundingResult,
  ScenarioIdea,
  type IdeasOutput,
  type ScenarioBrief,
} from '@shared/schemas'
import type { JobContext } from '../jobs/manager'
import { exists, readJson, readJsonOr, writeJsonAtomic } from '../lib/fs'
import { nowIso } from '../lib/ids'
import { projectPaths } from '../project/store'
import { scenarioLayout } from '../scenario/layout'
import { pipelineDeps, type SearchIndex } from './deps'
import type { FacilityFacts } from './facility'
import { seamChoices, toSeam } from '@shared/seams'
import type { ScenarioSeam } from '@shared/schemas'
import { loadSeamFindings, seamPromptVars } from './seams'
import type { Project } from '@shared/schemas'
import { contextFor } from '../grounding/project'
import { groundItems, ideaItems } from '../grounding/scenario'
import { toAppError } from '../lib/errors'
import { domainVars, ideaThreatFamily, profileFor, threatVars } from './domain'
import { facilitySheet } from './facility'
import { mapIdeas } from './mappers'
import { runStage } from './stage'
import { projectVars, taxonomyVarsFor } from './vars'

const IdeasFile = z.object({
  generatedAt: z.string(),
  ideas: z.array(ScenarioIdea).default([]),
  /** Grounding label per idea id (#423): whyItTeaches against sectionsExercised. */
  grounding: z.record(z.string(), GroundingResult).optional(),
})
type IdeasFile = z.infer<typeof IdeasFile>

export async function readIdeas(root: string): Promise<ScenarioIdea[]> {
  const file = await readJsonOr(projectPaths(root).ideas, IdeasFile, () => ({
    generatedAt: nowIso(),
    ideas: [],
  }))
  return file.ideas
}

export async function writeIdeas(
  root: string,
  ideas: ScenarioIdea[],
  grounding?: Record<string, GroundingResult>,
): Promise<void> {
  const value: IdeasFile = { generatedAt: nowIso(), ideas, ...(grounding ? { grounding } : {}) }
  await writeJsonAtomic(projectPaths(root).ideas, value)
}

/** Grounding labels of the ideas in ideas.json, by idea id (#423). */
export async function readIdeaGrounding(root: string): Promise<Record<string, GroundingResult>> {
  const file = await readJsonOr(projectPaths(root).ideas, IdeasFile, () => ({
    generatedAt: nowIso(),
    ideas: [],
  }))
  const out: Record<string, GroundingResult> = {}
  for (const [key, r] of Object.entries(file.grounding ?? {}))
    if (key.startsWith('idea:')) out[key.slice('idea:'.length)] = r
  return out
}

/** Keep ideas.json current with an idea handed in with generate:scenario (edits win). */
export async function rememberIdea(root: string, idea: ScenarioIdea): Promise<void> {
  const ideas = await readIdeas(root)
  const at = ideas.findIndex((i) => i.id === idea.id)
  const grounding = await readIdeaGroundingRaw(root)
  await writeIdeas(
    root,
    at >= 0 ? ideas.map((i, n) => (n === at ? idea : i)) : [idea, ...ideas],
    grounding,
  )
}

async function readIdeaGroundingRaw(
  root: string,
): Promise<Record<string, GroundingResult> | undefined> {
  const file = await readJsonOr(projectPaths(root).ideas, IdeasFile, () => ({
    generatedAt: nowIso(),
    ideas: [],
  }))
  return file.grounding
}

/** Labels for freshly written ideas; a failure only costs the labels. */
async function groundIdeas(
  root: string,
  ideas: ScenarioIdea[],
  src: { index: SearchIndex; facility: FacilityFacts; project: Project },
  ctx: JobContext,
): Promise<Record<string, GroundingResult> | undefined> {
  try {
    const gctx = await contextFor(root, { roles: [] }, src)
    return await groundItems(ideaItems(ideas), {}, gctx)
  } catch (err) {
    ctx.log(`Source check skipped: ${toAppError(err).message}`, 'warn', { stage: 'ideate' })
    return undefined
  }
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
  /** "From plan seams" (#427, FR-3): build the ideas around the open plan conflicts. */
  fromSeams?: boolean
}

/** At most this many seams go into the ideate prompt; the picker offers the same order. */
const IDEATE_SEAMS = 6

/** The seams the ideas are asked to target, in picker order (empty when the option is off). */
async function ideateSeams(root: string, on: boolean | undefined): Promise<ScenarioSeam[]> {
  if (!on) return []
  return seamChoices((await loadSeamFindings(root)) ?? [])
    .slice(0, IDEATE_SEAMS)
    .map(toSeam)
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
  const profile = profileFor(project)
  const seams = await ideateSeams(root, req.fromSeams)
  if (req.fromSeams && !seams.length)
    ctx.log('ideate: no open plan conflicts to build ideas on; run the plan check first', 'warn', {
      stage: 'ideate',
    })
  ctx.progress(0.05, 'Reading the plans for scenario hooks', { stage: 'ideate' })
  const result = await runStage<IdeasOutput>({
    stage: 'ideate',
    projectPath: root,
    vars: {
      project: projectVars(project),
      domain: domainVars(profile),
      // The families the domain can exercise, spelled out for the ideas to spread across.
      threatFamilies: profile.threatFamilies.map((id) => threatVars(threatFamily(id))),
      brief: req.brief,
      count: req.count,
      taxonomy: taxonomyVarsFor(profile),
      facility: facilitySheet(facility),
      instructions: '',
      ...(seams.length ? { seams: seamPromptVars({ seams }, seams) } : {}),
    },
    ctx,
    deps,
    index,
  })
  const { ideas, dropped, unknownSeams } = mapIdeas(
    result.output,
    result.retrieved,
    seams.map((x) => x.id),
  )
  if (unknownSeams.length)
    ctx.log(`ideate: unknown plan seam keys ${unknownSeams.join(', ')}; dropped`, 'warn', {
      stage: 'ideate',
    })
  for (const d of dropped)
    ctx.log(`Idea "${d.rowId}" cited unknown keys ${d.keys.join(', ')}; dropped`, 'warn', {
      stage: 'ideate',
    })
  // Each idea carries the threat family its text describes, so the scenario built from it
  // starts with the right phase arc (the designer can still change it in the brief).
  const kept = ideas.slice(0, req.count).map((idea) => ({
    ...idea,
    threatFamily: idea.threatFamily ?? ideaThreatFamily(idea, profile),
  }))
  await writeIdeas(root, kept, await groundIdeas(root, kept, { index, facility, project }, ctx))
  ctx.progress(1, `${kept.length} ideas`, { stage: 'ideate' })
  ctx.log(
    `ideate: ${kept.length} ideas, ${result.run.inputTokens ?? 0} in / ${result.run.outputTokens ?? 0} out tokens`,
    'info',
    { stage: 'ideate' },
  )
  return kept
}
