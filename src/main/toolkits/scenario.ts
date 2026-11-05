// A scenario's toolkits (spec 0448 FR-2): which are on, which the app proposes, and the
// switches. Proposals come from suggestToolkits (hazard words in the brief, the domain's
// suggestedToolkits); nothing is turned on until the user confirms.
import { resolveProfile } from '@shared/domains'
import type { ToolkitList } from '@shared/ipc/toolkits'
import type { Project, Scenario } from '@shared/schemas'
import { suggestToolkits } from '@shared/toolkits'
import { AppError } from '../lib/errors'
import { loadProject, updateProject } from '../project/store'
import { getScenario, updateScenario } from '../scenario/store'
import { listToolkits } from './registry'

/** The words of a brief the toolkit keywords are matched against. */
export function briefText(scenario: Pick<Scenario, 'brief' | 'title'>): string {
  const b = scenario.brief
  return [scenario.title, b.userPrompt, ...b.learningObjectives, ...b.constraints].join('\n')
}

function profileOf(project: Project) {
  return resolveProfile(
    project.orgType,
    project.domainProfileOverrides,
    project.domainProfileSnapshot,
  )
}

/** Every toolkit with the scenario's switches and, for the ones that are off, why to add them. */
export async function toolkitList(root: string, scenarioId?: string): Promise<ToolkitList> {
  const [project, listed] = await Promise.all([loadProject(root), listToolkits()])
  const scenario = scenarioId ? await getScenario(root, scenarioId) : undefined
  const active = scenario?.toolkits ?? []
  const profile = profileOf(project)
  const reasons = new Map(
    scenario
      ? suggestToolkits({
          available: listed.map((l) => l.toolkit),
          active,
          text: briefText(scenario),
          domainId: profile.id,
          domainLabel: profile.label,
          profileSuggested: profile.suggestedToolkits ?? [],
        }).map((s) => [s.toolkitId, s.reason])
      : [],
  )
  return {
    toolkits: listed.map((l) => ({
      ...l,
      enabled: active.includes(l.toolkit.id),
      ...(reasons.has(l.toolkit.id) ? { suggestion: reasons.get(l.toolkit.id)! } : {}),
    })),
    projectDefault: project.toolkits,
  }
}

/** Ids kept in the order given, no repeats; an id no enabled pack provides is refused. */
async function checkedIds(ids: readonly string[]): Promise<string[]> {
  const known = new Set((await listToolkits()).map((l) => l.toolkit.id))
  const unknown = ids.filter((id) => !known.has(id))
  if (unknown.length)
    throw new AppError('NOT_FOUND', `No enabled pack provides the toolkit ${unknown.join(', ')}`)
  return [...new Set(ids)]
}

export async function setScenarioToolkits(
  root: string,
  scenarioId: string,
  ids: readonly string[],
): Promise<string[]> {
  const toolkits = await checkedIds(ids)
  const next = await updateScenario(
    root,
    scenarioId,
    (s) => {
      s.toolkits = toolkits
    },
    { by: 'user', note: 'toolkits' },
  )
  return next.toolkits
}

export async function setProjectToolkits(root: string, ids: readonly string[]): Promise<string[]> {
  const toolkits = await checkedIds(ids)
  const next = await updateProject(root, (p) => {
    p.toolkits = toolkits
  })
  return next.toolkits
}
