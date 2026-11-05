// The generator's domain context with the scenario's toolkits resolved (spec 0448 FR-3).
// baseVars reads the toolkits from it, so every stage that passes the env's domain gets the
// toolkits' knowledge, outside parties and inject types without further plumbing.
import type { Scenario } from '@shared/schemas'
import { domainContext, type DomainContext, type ProjectDomain } from '../generate/domain'
import { resolveToolkits } from './registry'

export async function domainContextWithToolkits(
  project: ProjectDomain,
  scenario?: Pick<Scenario, 'brief' | 'toolkits'>,
): Promise<DomainContext> {
  const base = domainContext(project, scenario)
  const toolkits = await resolveToolkits(scenario?.toolkits ?? [])
  return toolkits.length ? { ...base, toolkits } : base
}
