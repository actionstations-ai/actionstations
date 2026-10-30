// "Make drills from this scenario" (spec 0437 FR-7): one draft drill for each plan section the
// scenario's overview says it tests, with the scenario's situation reused in shortened form.
// Each drill is built the normal way (buildMicroDrill), so the same checks apply and every drill
// stays a draft until a person reviews it.
import type { MicroDrill, MicroDrillSettings } from '@shared/schemas'
import type { Citation } from '@shared/schemas/common'
import type { JobContext } from '../jobs/manager'
import { AppError } from '../lib/errors'
import { pipelineDeps } from '../generate/deps'
import { getScenario } from '../scenario/store'
import { listAnnexes, type AnnexOption, type ChunkSource } from './annex'
import { buildMicroDrill } from './build'

export const MAX_SCENARIO_DRILLS = 5
const SEPARATOR = ' › '

export interface ScenarioAnnex {
  documentId: string
  headingPath: string
}

/**
 * The annex for a cited passage: the shallowest section above (or at) the citation that fits
 * the drill size limit, so the drill has the most context a drill can hold.
 */
export function annexFor(options: readonly AnnexOption[], citedPath: string): string | undefined {
  const parts = citedPath.split(/\s+›\s+/)
  for (let n = 1; n <= parts.length; n++) {
    const path = parts.slice(0, n).join(SEPARATOR)
    const hit = options.find((o) => o.headingPath === path)
    if (hit && !hit.tooLarge) return hit.headingPath
  }
  return undefined
}

/** One annex per distinct section the scenario tests, in citation order. */
export function annexesFromCitations(
  index: ChunkSource,
  citations: readonly Pick<Citation, 'documentId' | 'headingPath'>[],
): { annexes: ScenarioAnnex[]; skipped: string[] } {
  const annexes: ScenarioAnnex[] = []
  const skipped: string[] = []
  const options = new Map<string, AnnexOption[]>()
  for (const c of citations) {
    if (!options.has(c.documentId)) options.set(c.documentId, listAnnexes(index, c.documentId))
    const headingPath = annexFor(options.get(c.documentId)!, c.headingPath)
    if (!headingPath) {
      skipped.push(c.headingPath)
      continue
    }
    if (!annexes.some((a) => a.documentId === c.documentId && a.headingPath === headingPath))
      annexes.push({ documentId: c.documentId, headingPath })
  }
  return { annexes: annexes.slice(0, MAX_SCENARIO_DRILLS), skipped }
}

/** The scenario's situation in a few sentences, for the build prompt. */
export function situationOf(theme: string, threat: string): string {
  return `${theme.trim()} ${threat.trim()}`.trim().slice(0, 600)
}

export async function buildFromScenario(
  root: string,
  scenarioId: string,
  settings: MicroDrillSettings,
  ctx: JobContext,
): Promise<{ drillIds: string[]; skipped: string[] }> {
  const scenario = await getScenario(root, scenarioId)
  const cited = scenario.overview?.coreSectionsTested ?? []
  if (!scenario.overview || !cited.length)
    throw new AppError('VALIDATION', 'This scenario does not say which plan sections it tests')
  const deps = await pipelineDeps()
  const index = (await deps.openIndex(root)) as unknown as ChunkSource
  const { annexes, skipped } = annexesFromCitations(index, cited)
  if (!annexes.length)
    throw new AppError('VALIDATION', 'None of the tested plan sections is a size a drill can use')
  const scenarioSituation = situationOf(scenario.overview.theme, scenario.overview.threat)
  const drillIds: string[] = []
  for (const [i, a] of annexes.entries()) {
    ctx.progress(i / annexes.length, `Building drill ${i + 1} of ${annexes.length}`)
    const drill: MicroDrill = await buildMicroDrill(
      root,
      { ...a, settings, scenarioSituation },
      ctx,
    )
    drillIds.push(drill.id)
  }
  ctx.progress(1, `${drillIds.length} draft drill(s) built`)
  return { drillIds, skipped }
}
