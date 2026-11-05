// Variables every prompt can use (prompts/*.md `variables:` frontmatter documents which ones a
// stage reads). Kept compact: the model sees the scenario state, not storage details.
import type { MselRow, Project, Role, Scenario, ScenarioIdea } from '@shared/schemas'
import type { DomainProfile } from '@shared/domains'
import {
  injectTypes,
  injectTypesForDomain,
  PURPOSE_TAG_INFO,
  PURPOSE_TAGS,
  type InjectTypeInfo,
} from '@shared/taxonomy'
import {
  KNOWLEDGE_TOTAL_CAP,
  mergedOutsideParties,
  toolkitInjectTypeIds,
  toolkitKnowledge,
  type Toolkit,
} from '@shared/toolkits'
import { citationLabel } from './docs'
import { domainContext, domainVars, threatVars, type DomainContext } from './domain'
import { DEFAULT_START_WALL_CLOCK, goalSummary, phaseBeats } from './mappers'

/** Tags that delimit data blocks in the prompts. */
const DATA_TAG = /<(?=\s*\/?\s*(?:documents?|scenario_state)\b)/gi

/**
 * Earlier model output (which can quote the documents) goes back into later prompts inside
 * <scenario_state>; a "</scenario_state>" or "</documents>" in it must not end that block.
 */
export function dataSafe<T>(value: T): T {
  if (typeof value === 'string') return value.replace(DATA_TAG, '‹') as T
  if (Array.isArray(value)) return value.map(dataSafe) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, dataSafe(v)]),
    ) as T
  }
  return value
}

export function projectVars(p: Project) {
  return {
    name: p.name,
    orgName: p.orgName || p.name,
    orgType: p.orgType,
    city: p.brand.city ?? '',
    region: p.brand.region ?? '',
    aliases: p.brand.aliases,
    documents: p.documents
      .filter((d) => d.status === 'ok')
      .map((d) => ({ title: d.title, shortName: d.shortName ?? d.title, kind: d.kind })),
  }
}

const typeVars = (types: readonly InjectTypeInfo[]) =>
  types.map((t) => ({
    id: t.id,
    label: t.label,
    category: t.category,
    delivery: t.defaultDelivery,
  }))

export const taxonomyVars = {
  purposeTags: PURPOSE_TAGS.map((tag) => ({ tag, ...PURPOSE_TAG_INFO[tag] })),
  /** Built-in types plus those user and pack templates register (ADR-0018). */
  get injectTypes() {
    return typeVars(injectTypes())
  },
}

/** The taxonomy as a domain sees it: its preferred types first, other-domain types left out. */
export function taxonomyVarsFor(profile: DomainProfile) {
  const allowed = injectTypesForDomain(profile.id)
  const preferred = profile.injectTypes
    .map((id) => allowed.find((t) => t.id === id))
    .filter((t): t is InjectTypeInfo => !!t)
  const rest = allowed.filter((t) => !profile.injectTypes.includes(t.id))
  return { ...taxonomyVars, injectTypes: typeVars([...preferred, ...rest]) }
}

function roleVars(r: Role) {
  return dataSafe({
    key: r.id,
    name: r.name,
    abbreviation: r.abbreviation,
    team: r.team,
    description: r.description,
    standingOrders: r.standingOrders,
  })
}

export function rowVars(r: MselRow, roles: Role[]) {
  const to =
    r.toLabel ||
    roles
      .filter((x) => r.toRoleIds.includes(x.id))
      .map((x) => x.abbreviation || x.name)
      .join(', ') ||
    'All'
  return dataSafe({
    id: r.id,
    time: r.time,
    wallClock: r.wallClock ?? '',
    from: r.from,
    to,
    toKeys: r.toRoleIds,
    event: r.event,
    expectedAction: r.expectedAction,
    purposeTag: r.purposeTag,
    format: r.format ?? '',
    citations: r.citations.map(citationLabel),
  })
}

export function scenarioVars(s: Scenario) {
  const o = s.overview
  return dataSafe({
    id: s.id,
    title: s.title,
    subtitle: s.subtitle ?? '',
    overview: o ? { ...o, coreSectionsTested: o.coreSectionsTested.map(citationLabel) } : undefined,
    objectives: s.objectives.map((ob) => ({ name: ob.name, text: ob.text })),
    roles: s.roles.map(roleVars),
    phases: s.phases.map((p) => ({
      number: p.index + 1,
      title: p.title,
      goal: goalSummary(p.goal),
      beats: phaseBeats(p),
      startTime: p.startTime,
      endTime: p.endTime,
    })),
    msel: s.msel.map((r) => rowVars(r, s.roles)),
    rowCount: s.msel.length,
    criticalResources: s.criticalResources,
    rubric: s.rubric?.metrics ?? [],
    hotwash: s.hotwash,
    simcellScripts: s.simcellScripts,
    warnings: s.warnings.map((w) => ({
      code: w.code,
      severity: w.severity,
      message: w.message,
      rowId: w.rowId ?? '',
    })),
  })
}

export interface BaseVarsInput {
  project: Project
  scenario: Scenario
  idea?: ScenarioIdea
  instructions?: string
  /** The project's profile and the scenario's threat family; derived from them when absent. */
  domain?: DomainContext
}

/**
 * `toolkits` for the prompts (spec 0448 FR-3): the scenario's toolkits, their knowledge within
 * the cap and the data sources they use. Undefined when the scenario has none, so a prompt's
 * `{{#if toolkits}}` block drops out.
 */
export function toolkitVars(toolkits: readonly Toolkit[] | undefined) {
  if (!toolkits?.length) return undefined
  const knowledge = toolkitKnowledge(toolkits, KNOWLEDGE_TOTAL_CAP)
  return dataSafe({
    list: toolkits.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      connectors: t.connectors,
      figureKinds: t.figureKinds,
      documents: t.documents.map((d) => d.title),
    })),
    names: toolkits.map((t) => t.name),
    knowledge: knowledge.text.replace(/<(?=\s*\/?\s*toolkit_knowledge\b)/gi, '‹'),
    hasKnowledge: knowledge.text.length > 0,
  })
}

/** The profile's domain variables with the toolkits' outside parties and inject types added. */
function domainVarsWith(domain: DomainContext) {
  const base = domainVars(domain.profile)
  const toolkits = domain.toolkits ?? []
  if (!toolkits.length) return base
  const known = new Set(injectTypes().map((t) => t.id))
  return {
    ...base,
    outsideParties: mergedOutsideParties(base.outsideParties, toolkits),
    injectTypes: [
      ...base.injectTypes,
      ...toolkitInjectTypeIds(base.injectTypes, toolkits).filter((id) => known.has(id)),
    ],
  }
}

/** The taxonomy with the toolkits' inject types after the domain's own. */
function taxonomyWith(domain: DomainContext) {
  const base = taxonomyVarsFor(domain.profile)
  const toolkits = domain.toolkits ?? []
  const have = new Set(base.injectTypes.map((t) => t.id))
  const extra = toolkitInjectTypeIds([], toolkits)
    .filter((id) => !have.has(id))
    .map((id) => injectTypes().find((t) => t.id === id))
    .filter((t): t is InjectTypeInfo => !!t)
  return extra.length ? { ...base, injectTypes: [...base.injectTypes, ...typeVars(extra)] } : base
}

export function baseVars(input: BaseVarsInput): Record<string, unknown> {
  const { project, scenario, idea, instructions } = input
  const domain = input.domain ?? domainContext(project, scenario)
  const toolkits = toolkitVars(domain.toolkits)
  return {
    project: projectVars(project),
    domain: domainVarsWith(domain),
    ...(toolkits ? { toolkits } : {}),
    threat: threatVars(domain.threat),
    brief: scenario.brief,
    startWallClock: scenario.brief.startWallClock ?? DEFAULT_START_WALL_CLOCK,
    durationHours: scenario.brief.durationHours,
    phaseCount: scenario.brief.phaseCount,
    idea: idea
      ? dataSafe({ ...idea, sectionsExercised: idea.sectionsExercised.map(citationLabel) })
      : undefined,
    scenario: scenarioVars(scenario),
    roles: scenario.roles.map(roleVars),
    phases: scenarioVars(scenario).phases,
    taxonomy: taxonomyWith(domain),
    instructions: instructions ?? '',
  }
}
