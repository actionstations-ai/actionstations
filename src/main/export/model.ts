// Everything one export needs, read once from the project: scenario, injects (MSEL order),
// markdown documents, brand, and the media file plan.
import type { Brand, Inject, Project, Scenario } from '@shared/schemas'
import { safeJoinReal } from '../lib/fs'
import { loadProject } from '../project/store'
import { getScenario, listInjects, readScenarioDoc } from '../scenario/store'
import { planMediaFiles, scenarioNumber, type PlannedMedia } from './naming'

export interface ExportDocs {
  handbook: string
  briefing: string
  hotwash: string
  overview: string
}

export interface ExportModel {
  root: string
  project: Pick<Project, 'id' | 'name' | 'orgName' | 'scenarios'> & { brand: Brand }
  scenario: Scenario
  injects: Inject[]
  docs: ExportDocs
  scenarioNo: string
  media: PlannedMedia[]
  /** Project-relative paths of asset files (and posters) that exist on disk. */
  available: Set<string>
  /** ISO time the export started; printed in footers and the manifest. */
  generatedAt: string
}

export async function loadExportModel(
  root: string,
  scenarioId: string,
  now = new Date(),
): Promise<ExportModel> {
  const [project, scenario, all] = await Promise.all([
    loadProject(root),
    getScenario(root, scenarioId),
    listInjects(root, scenarioId),
  ])
  const injects = liveInjects(scenario, all)
  const read = (kind: 'handbook' | 'briefing' | 'hotwash' | 'overview') =>
    readScenarioDoc(root, scenarioId, kind)
  const [handbook, briefing, hotwash, overview] = await Promise.all([
    read('handbook'),
    read('briefing'),
    read('hotwash'),
    read('overview'),
  ])
  const scenarioNo = scenarioNumber(scenario, project.scenarios)
  const media = planMediaFiles(scenarioNo, injects)
  return {
    root,
    project: {
      id: project.id,
      name: project.name,
      orgName: project.orgName,
      scenarios: project.scenarios,
      brand: project.brand,
    },
    scenario,
    injects,
    docs: { handbook, briefing, hotwash, overview },
    scenarioNo,
    media,
    available: await availablePaths(root, injects),
    generatedAt: now.toISOString(),
  }
}

/**
 * Injects whose MSEL row still exists (#207). An orphan (its row was removed by a re-run or an
 * edit) is left out of the deck, so its media and manifest entry are left out too.
 */
export function liveInjects(scenario: Scenario, injects: Inject[]): Inject[] {
  const rows = new Set(scenario.msel.map((r) => r.id))
  return injects.filter((i) => rows.has(i.mselRowId))
}

async function availablePaths(root: string, injects: Inject[]): Promise<Set<string>> {
  const paths = injects.flatMap((i) =>
    i.assets.flatMap((a) => (a.posterPath ? [a.path, a.posterPath] : [a.path])),
  )
  // A path counts only when it resolves to a real file inside the project: missing files and
  // symlinks pointing outside the project folder are both left out (reported as missing).
  return new Set(paths.filter((p) => insideProject(root, p)))
}

function insideProject(root: string, rel: string): boolean {
  try {
    safeJoinReal(root, rel)
    return true
  } catch {
    return false
  }
}
