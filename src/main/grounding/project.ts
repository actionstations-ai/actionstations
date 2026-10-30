// Grounding against a project on disk (#423): the index, facility-facts.md and the active
// embedder for the checker, and the writes that keep scenario.json's grounding current after
// generation and edits. Grounding never blocks the work it follows: a failure is logged and the
// labels are recomputed on the next read (grounding:scenario).
import type { Inject, Project, Scenario, ScenarioGrounding } from '@shared/schemas'
import { pipelineDeps } from '../generate/deps'
import { factIds, type FacilityFacts } from '../generate/facility'
import { nowIso } from '../lib/ids'
import type { EmbeddingProvider } from '../providers/types'
import type { GroundingIndex } from './resolve'
import {
  factKeys,
  groundItems,
  groundScenario,
  roleIgnores,
  scenarioItems,
  type GroundingContext,
} from './scenario'

export interface ContextSources {
  index?: GroundingIndex
  facility?: FacilityFacts
  project?: Project
  /** Skip the embedder (engine tests, saves that must stay fast). */
  embedder?: EmbeddingProvider | null
}

/** Every identifier the facts state (ranges expanded). */
export const facilityEntries = (f: FacilityFacts): string[] =>
  f.categories.flatMap((c) => factIds(f, c.id))

async function embedderFor(root: string): Promise<EmbeddingProvider | undefined> {
  try {
    const { activeEmbedder } = await import('../retrieve')
    const e = await activeEmbedder(root)
    return e.id === 'hash' ? undefined : e
  } catch {
    return undefined
  }
}

async function withheldFor(root: string, embedder: EmbeddingProvider) {
  const { neverSendDocuments } = await import('../providers/outbound/never-send')
  return neverSendDocuments(root, embedder)
}

/** The checker's context for a scenario of the project at `root`. */
export async function contextFor(
  root: string,
  scenario: Pick<Scenario, 'roles'>,
  src: ContextSources = {},
): Promise<GroundingContext> {
  // The pipeline's dependencies, so tests swap the index and facts the same way for both.
  const deps = src.index && src.facility ? undefined : await pipelineDeps()
  const index: GroundingIndex = src.index ?? (await deps!.openIndex(root))
  let facility = src.facility
  if (!facility) {
    const project = src.project ?? (await deps!.loadProject(root))
    facility = await deps!.loadFacilityFacts(root, project)
  }
  const embedder = src.embedder === null ? undefined : (src.embedder ?? (await embedderFor(root)))
  return {
    index,
    facts: factKeys(facilityEntries(facility), scenario.roles),
    ignore: roleIgnores(scenario.roles),
    ...(embedder ? { embedder } : {}),
    ...(embedder?.remote ? { withheldDocuments: await withheldFor(root, embedder) } : {}),
    now: nowIso,
  }
}

/**
 * The scenario's grounding with stale items recomputed. Without `injects`, the stored inject
 * results are kept as they are (the pipeline stages never touch injects).
 */
export async function regroundScenario(
  s: Scenario,
  ctx: GroundingContext,
  injects?: Inject[],
): Promise<ScenarioGrounding> {
  if (injects) return groundScenario(s, injects, ctx)
  const stored = s.grounding?.items ?? {}
  const items = await groundItems(scenarioItems(s, []), stored, ctx)
  for (const [key, r] of Object.entries(stored)) if (key.startsWith('inject:')) items[key] = r
  return { ...(s.grounding ?? {}), items }
}

/** True when two groundings hold the same results (nothing to write). */
export function sameGrounding(a: ScenarioGrounding | undefined, b: ScenarioGrounding): boolean {
  const x = a?.items ?? {}
  const y = b.items
  const keys = new Set([...Object.keys(x), ...Object.keys(y)])
  for (const k of keys) {
    if (x[k]?.fingerprint !== y[k]?.fingerprint) return false
    if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) return false
  }
  return true
}
