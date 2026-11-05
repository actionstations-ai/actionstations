// Toolkits a project can use (ADR-0074, spec 0448). They come from enabled packs only: an
// installed pack's `toolkits/<id>.json`, then an enabled bundled pack's; the first pack to
// provide an id wins. Unlike regulations there is no project copy yet: a toolkit is guidance
// for the generator and a list of built-in capabilities, so a missing one is skipped instead
// of changing what a saved scenario shows.
import { promises as fs } from 'node:fs'
import { ToolkitSchema, type Toolkit, type ToolkitSource } from '@shared/toolkits'
import { bundledPacks, enabledPacks, packItemPath, packsRevision } from '../packs/layers'
import { toolkitGuardrailCategories } from './lab_safety/load-check'

export interface ListedToolkit {
  toolkit: Toolkit
  source: ToolkitSource
}

let cache: { revision: number; items: ListedToolkit[] } | undefined

async function readToolkit(path: string): Promise<Toolkit | undefined> {
  try {
    const parsed = ToolkitSchema.safeParse(JSON.parse(await fs.readFile(path, 'utf8')))
    if (parsed.success) {
      // A toolkit that names the lab guardrail rule is refused when its content fails it (ADR-0135).
      const categories = toolkitGuardrailCategories(parsed.data)
      if (!categories.length) return parsed.data
      console.error(
        `[toolkits] ${path} fails the lab content guardrails (${categories.join(', ')})`,
      )
      return undefined
    }
    console.error(`[toolkits] ${path} is not a valid toolkit; it is ignored`)
  } catch (e) {
    console.error(`[toolkits] cannot read ${path}:`, (e as Error).message)
  }
  return undefined
}

/** Every toolkit of the enabled packs, installed first, one per id. */
export async function listToolkits(): Promise<ListedToolkit[]> {
  const revision = packsRevision()
  if (cache?.revision === revision) return cache.items
  const packs = [...enabledPacks(), ...bundledPacks().filter((p) => p.enabled)]
  const byId = new Map<string, ListedToolkit>()
  for (const pack of packs)
    for (const id of pack.manifest.contents.toolkits ?? []) {
      if (byId.has(id)) continue
      const toolkit = await readToolkit(packItemPath(pack, 'toolkits', id))
      if (!toolkit || toolkit.id !== id) continue
      byId.set(id, {
        toolkit,
        source: {
          layer: pack.bundled ? 'bundled' : 'pack',
          packId: pack.id,
          packName: pack.name,
          packVersion: pack.version,
        },
      })
    }
  const items = [...byId.values()].sort((a, b) => a.toolkit.name.localeCompare(b.toolkit.name))
  cache = { revision, items }
  return items
}

/** The toolkits for `ids`, in that order; ids no enabled pack provides are left out. */
export async function resolveToolkits(ids: readonly string[]): Promise<Toolkit[]> {
  if (!ids.length) return []
  const all = new Map((await listToolkits()).map((l) => [l.toolkit.id, l.toolkit]))
  return ids.flatMap((id) => {
    const t = all.get(id)
    return t ? [t] : []
  })
}
