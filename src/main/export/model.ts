// Everything one export needs, read once from the project: scenario, injects (MSEL order),
// markdown documents, brand, and the media file plan.
import {
  conductOf,
  type Aar,
  type Brand,
  type ConductDetails,
  type Inject,
  type Project,
  type Scenario,
  type Survey,
  type SurveySummary,
} from '@shared/schemas'
import { readAar } from '../aar/store'
import { safeJoinReal } from '../lib/fs'
import { loadProject } from '../project/store'
import { getScenario, listInjects, readScenarioDoc } from '../scenario/store'
import { minResponsesSetting, surveySummary } from '../surveys/results'
import { listSurveys } from '../surveys/store'
import { evaluationOf, type ExportEvaluation } from './evaluation'
import { planMediaFiles, scenarioNumber, type PlannedMedia } from './naming'

export interface ExportDocs {
  handbook: string
  briefing: string
  hotwash: string
  overview: string
  /** Player handouts (players/ and facilitator/); '' when the scenario has none. */
  handouts: string
  /** Facilitator-only handouts (facilitator/ only); '' when the scenario has none. */
  controller_handouts: string
  /** The AAR/IP document (#419), with the prose a person edited; '' before the first draft. */
  aar: string
}

/** A survey and its results (#422): forms print the survey, the results PDF the summary. */
export interface ExportSurvey {
  survey: Survey
  summary: SurveySummary
}

export interface ExportModel {
  root: string
  project: Pick<Project, 'id' | 'name' | 'orgName' | 'scenarios'> & { brand: Brand }
  scenario: Scenario
  injects: Inject[]
  docs: ExportDocs
  scenarioNo: string
  media: PlannedMedia[]
  /** Project-relative paths of asset files (and posters, and the brand logo) that exist on disk. */
  available: Set<string>
  /** ISO time the export started; printed in footers and the manifest. */
  generatedAt: string
  /** Exercise details for the HSEEP documents (#420), defaults filled in. */
  conduct: ConductDetails
  /** Exercise Evaluation Guides and Core Capabilities (#421); absent until that data exists. */
  evaluation?: ExportEvaluation
  /** The scenario's surveys, archived ones left out, with their results. */
  surveys: ExportSurvey[]
  /**
   * MSEL row id → source-check label text, when the export asked for the column (#423). The
   * controller MSEL is the only document that reads it; player material never does.
   */
  sourceCheck?: Record<string, string>
  /** The After-Action Report / Improvement Plan (#419); null before the first draft. */
  aar: Aar | null
}

/** Surveys with their summaries, the anonymity threshold from settings applied. */
async function loadSurveys(root: string, scenarioId: string): Promise<ExportSurvey[]> {
  const surveys = (await listSurveys(root, scenarioId)).filter((s) => s.status !== 'archived')
  if (!surveys.length) return []
  const min = await minResponsesSetting()
  return Promise.all(
    surveys.map(async (survey) => ({
      survey,
      summary: await surveySummary(root, scenarioId, survey.id, min),
    })),
  )
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
  const read = (kind: keyof ExportDocs) => readScenarioDoc(root, scenarioId, kind)
  const [handbook, briefing, hotwash, overview, handouts, controllerHandouts, aarDoc] =
    await Promise.all([
      read('handbook'),
      read('briefing'),
      read('hotwash'),
      read('overview'),
      read('handouts'),
      read('controller_handouts'),
      read('aar'),
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
    docs: {
      handbook,
      briefing,
      hotwash,
      overview,
      handouts,
      controller_handouts: controllerHandouts,
      aar: aarDoc,
    },
    scenarioNo,
    media,
    available: await availablePaths(root, injects, project.brand.logoPath),
    generatedAt: now.toISOString(),
    surveys: await loadSurveys(root, scenarioId),
    conduct: conductOf(scenario),
    ...optionalEvaluation(scenario),
    aar: await readAar(root, scenarioId),
  }
}

function optionalEvaluation(scenario: Scenario): { evaluation?: ExportEvaluation } {
  const evaluation = evaluationOf(scenario)
  return evaluation ? { evaluation } : {}
}

/**
 * Injects whose MSEL row still exists (#207). An orphan (its row was removed by a re-run or an
 * edit) is left out of the deck, so its media and manifest entry are left out too.
 */
export function liveInjects(scenario: Scenario, injects: Inject[]): Inject[] {
  const rows = new Set(scenario.msel.map((r) => r.id))
  return injects.filter((i) => rows.has(i.mselRowId))
}

async function availablePaths(
  root: string,
  injects: Inject[],
  logoPath?: string,
): Promise<Set<string>> {
  const paths = injects.flatMap((i) =>
    i.assets.flatMap((a) => (a.posterPath ? [a.path, a.posterPath] : [a.path])),
  )
  if (logoPath) paths.push(logoPath)
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
