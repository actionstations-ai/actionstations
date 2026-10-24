// Ids the app ships in its bundled packs (ADR-0020), which installed pack items may shadow
// (templates, prompts, workflows, examples) or must name (prompts), with the bundled pack that
// ships each one ("replaces Action Stations Core: tweet" in the review).
import type { PackKind } from '@shared/schemas/pack'
import { bundledPacks } from './layers'

export interface PackBuiltins {
  templates: readonly string[]
  /** Shipped prompt names: a pack prompt must use one of them. */
  prompts: readonly string[]
  workflows: readonly string[]
  examples: readonly string[]
  /** The bundled pack that ships each id, by kind. */
  owners?: Partial<Record<PackKind, Record<string, { id: string; name: string }>>>
}

const KINDS = ['templates', 'prompts', 'workflows', 'examples'] as const

/** From the loaded bundled packs (in source mode, the repo's when nothing loaded yet). */
export async function loadBuiltins(): Promise<PackBuiltins> {
  const packs = bundledPacks()
  const owners: NonNullable<PackBuiltins['owners']> = {}
  const ids = (kind: (typeof KINDS)[number]): string[] => {
    const own: Record<string, { id: string; name: string }> = {}
    for (const p of packs)
      for (const id of p.manifest.contents[kind]) own[id] = { id: p.id, name: p.name }
    owners[kind] = own
    return Object.keys(own).sort()
  }
  const [templates, prompts, workflows, examples] = KINDS.map(ids) as [
    string[],
    string[],
    string[],
    string[],
  ]
  return { templates, prompts, workflows, examples, owners }
}
