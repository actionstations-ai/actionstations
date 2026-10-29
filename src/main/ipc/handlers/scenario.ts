import type { LintWarning, Scenario } from '@shared/schemas'
import { Scenario as ScenarioSchema, ScenarioBrief } from '@shared/schemas'
import { defineHandlers } from '../registry'
import { syncInjectRowIds } from '../../scenario/inject-links'
import { requireProject } from '../../project/guard'
import { loadProject } from '../../project/store'
import { domainContext, type DomainContext } from '../../generate/domain'
import { markStaleCritique } from '../../generate/critique-notes'
import { lintFacilityIds } from '../../generate/facility'
import { loadFacilityFacts } from '../../generate/facility-file'
import { contextFor, regroundScenario, type ContextSources } from '../../grounding/project'
import { groundingWarnings } from '../../grounding/scenario'
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { readHistory } from '../../scenario/history'
import {
  createScenario,
  getScenario,
  listInjects,
  readScenarioDoc,
  requireScenarioDir,
  saveScenario,
  writeScenarioDoc,
} from '../../scenario/store'
import {
  deleteScenario,
  duplicateScenario,
  listHistory,
  listScenarios,
  restoreHistory,
} from '../../scenario/manage'

type LintModule = {
  lintScenario?: (s: Scenario, domain?: DomainContext) => LintWarning[] | Promise<LintWarning[]>
}

// The linter is built by the pipeline workstream; a glob keeps main building without it.
const lintModules = import.meta.glob<LintModule>('../../generate/lint.ts')

/**
 * Fresh lint when the linter exists, otherwise the warnings stored on the scenario. With the
 * project root, rows are also checked against facility-facts.md (FACILITY_UNKNOWN_ID, #155), so
 * an edit on the Facility facts screen shows up on the next lint.
 */
export async function lintOrStored(scenario: Scenario, root?: string): Promise<LintWarning[]> {
  const load = Object.values(lintModules)[0]
  const mod = load ? await load() : undefined
  if (!mod?.lintScenario) return scenario.warnings
  if (!root) return mod.lintScenario(scenario)
  // The project's domain profile and the scenario's threat family shape the mix rules, and
  // the facts carry the profile's categories (ADR-0014).
  const project = await loadProject(root)
  const fresh = await mod.lintScenario(scenario, domainContext(project, scenario))
  const facts = await loadFacilityFacts(root, project)
  return [
    ...fresh,
    ...lintFacilityIds(scenario, facts),
    ...(await groundingLints(root, scenario, { project, facility: facts })),
  ]
}

/**
 * GROUNDING_UNSUPPORTED / GROUNDING_REVIEW (#423) from labels recomputed where stale, so the
 * checks of a scenario that never had labels (an example, an older project) list them too.
 */
async function groundingLints(
  root: string,
  scenario: Scenario,
  src: Pick<ContextSources, 'project' | 'facility'>,
): Promise<LintWarning[]> {
  try {
    const ctx = await contextFor(root, scenario, src)
    const grounding = await regroundScenario(scenario, ctx, await listInjects(root, scenario.id))
    return groundingWarnings({ ...scenario, grounding })
  } catch {
    return groundingWarnings(scenario)
  }
}

/**
 * Labels for the items this save changed (#423, FR-6); unchanged items keep their results. A
 * failure (no index yet) leaves the stored labels; the next read recomputes them.
 */
async function groundBeforeSave(root: string, scenario: Scenario): Promise<void> {
  try {
    const ctx = await contextFor(root, scenario)
    scenario.grounding = await regroundScenario(scenario, ctx, await listInjects(root, scenario.id))
  } catch {
    // Labels are recomputed on the next grounding:scenario.
  }
}

/**
 * Critique notes on rows this save changes (against the stored scenario) or whose inject
 * changed after the review are marked stale (#342). A new scenario has nothing to compare.
 */
async function markEditedNotes(root: string, scenario: Scenario): Promise<void> {
  if (!scenario.warnings.some((w) => w.source === 'critique')) return
  const stored = await getScenario(root, scenario.id).catch(() => undefined)
  if (!stored) return
  const injects = await listInjects(root, scenario.id)
  markStaleCritique(scenario, { before: stored.msel, injects })
}

export default defineHandlers({
  'scenarios:list': async ({ projectPath }) => listScenarios(await requireProject(projectPath)),

  'scenarios:get': async ({ projectPath, scenarioId }) =>
    getScenario(await requireProject(projectPath), scenarioId),

  'scenarios:save': async ({ projectPath, scenario, note, baseUpdatedAt }) => {
    const root = await requireProject(projectPath)
    await markEditedNotes(root, scenario)
    await groundBeforeSave(root, scenario)
    const saved = await saveScenario(root, scenario, {
      by: 'user',
      ...(note ? { note } : {}),
      ...(baseUpdatedAt ? { baseUpdatedAt } : {}),
    })
    await syncInjectRowIds(root, saved)
    return saved
  },

  'scenarios:create-empty': async ({ projectPath, title, brief }) => {
    const root = await requireProject(projectPath)
    return createScenario(root, { title, brief: ScenarioBrief.parse(brief ?? {}) })
  },

  'scenarios:delete': async ({ projectPath, scenarioId }) => {
    const root = await requireProject(projectPath)
    await deleteScenario(root, scenarioId)
  },

  'scenarios:duplicate': async ({ projectPath, scenarioId, title }) =>
    duplicateScenario(await requireProject(projectPath), scenarioId, title),

  'scenarios:lint': async ({ projectPath, scenarioId }) => {
    const root = await requireProject(projectPath)
    return lintOrStored(await getScenario(root, scenarioId), root)
  },

  'scenarios:doc-get': async ({ projectPath, scenarioId, kind }) => {
    const root = await requireProject(projectPath)
    return { markdown: await readScenarioDoc(root, scenarioId, kind) }
  },

  'scenarios:doc-save': async ({ projectPath, scenarioId, kind, markdown, note }) => {
    const root = await requireProject(projectPath)
    await writeScenarioDoc(root, scenarioId, kind, markdown, {
      by: 'user',
      ...(note ? { note } : {}),
    })
  },

  'scenarios:history': async ({ projectPath, scenarioId, artifact }) =>
    listHistory(await requireProject(projectPath), scenarioId, artifact),

  'scenarios:history-get': async ({ projectPath, scenarioId, artifact, entryId }) => {
    const root = await requireProject(projectPath)
    const layout = await requireScenarioDir(root, scenarioId)
    const entry = (await readHistory(layout.historyFile(artifact))).find((e) => e.id === entryId)
    if (!entry) throw new AppError('NOT_FOUND', `No history entry ${entryId} for ${artifact}`)
    if (artifact !== 'scenario') return { markdown: z.string().parse(entry.snapshot) }
    return { scenario: ScenarioSchema.parse(entry.snapshot) }
  },

  'scenarios:history-restore': async ({ projectPath, scenarioId, artifact, entryId }) => {
    const root = await requireProject(projectPath)
    await restoreHistory(root, scenarioId, artifact, entryId)
  },
})
