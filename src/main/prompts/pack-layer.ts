// Pack prompt layer (ADR-0018, #262): between the global override and the shipped default.
//
//   project > global > pack > default
//
// The pack layer is the enabled installed packs, then the enabled bundled domain packs
// (ADR-0020; the core pack's prompts are the default layer, see layers.ts).
//
// Only enabled packs whose manifest `domains` is empty or lists the project's resolved domain
// id contribute; with no project, only packs with empty `domains`. The domain id is resolved
// through the domain registry (snapshot first, then built-in / pack profiles by id or alias),
// never by comparing raw orgType strings. Two enabled packs never provide the same prompt
// (the installer refuses the conflict), so the first match is the only one.
//
// Pack files are read-only and verified at install, so their text is cached until the pack
// set changes (packsRevision). Pack prompts go through the same YAML-only parser as every
// other layer: a `---js` (or any non-YAML) frontmatter is refused.
import { promises as fs } from 'node:fs'
import { baseProfile } from '@shared/domains'
import {
  bundledPacks,
  enabledItems,
  packAppliesToDomain,
  packItemPath,
  packsRevision,
  type InstalledPack,
} from '../packs/layers'
import { loadProject } from '../project/store'
import { promptFileName } from './layers'

/** Which pack a pack-layer prompt came from (provenance shown in the editor, #269). */
export interface PackPromptSource {
  packId: string
  packVersion: string
  packName: string
}

export interface PackPromptLayer extends PackPromptSource {
  raw: string
}

const rawCache = new Map<string, string>()
let cachedRevision = -1

function cacheForRevision(): Map<string, string> {
  const revision = packsRevision()
  if (revision !== cachedRevision) {
    rawCache.clear()
    cachedRevision = revision
  }
  return rawCache
}

/** The domain id a project resolves to (snapshot, then registry by id or alias; generic). */
export async function projectDomainId(root: string): Promise<string> {
  const project = await loadProject(root)
  return baseProfile(project.orgType, project.domainProfileSnapshot).id
}

/** Prompt items of the pack layer: installed packs first, then enabled bundled domain packs. */
function promptItems(): { pack: InstalledPack; id: string }[] {
  const bundled = bundledPacks()
    .filter((p) => p.enabled !== false && !p.core)
    .flatMap((pack) => pack.manifest.contents.prompts.map((id) => ({ pack, id })))
  return [...enabledItems('prompts'), ...bundled]
}

/** The enabled pack that provides prompt `name` for `domainId`, if any. */
export function packForPrompt(
  name: string,
  domainId: string | undefined,
): InstalledPack | undefined {
  return promptItems().find((item) => item.id === name && packAppliesToDomain(item.pack, domainId))
    ?.pack
}

export const packSourceOf = (pack: InstalledPack): PackPromptSource => ({
  packId: pack.id,
  packVersion: pack.version,
  packName: pack.name,
})

/** Location of a pack prompt for error messages. */
export const packLayerLabel = (source: PackPromptSource, name: string): string =>
  `pack ${source.packName} (${source.packId}@${source.packVersion}) prompts/${promptFileName(name)}`

/** The pack layer of prompt `name` for a project root (or no project), or undefined. */
export async function readPackLayer(
  name: string,
  root: string | undefined,
): Promise<PackPromptLayer | undefined> {
  if (promptItems().length === 0) return undefined
  const domainId = root ? await projectDomainId(root) : undefined
  const pack = packForPrompt(name, domainId)
  if (!pack) return undefined
  const cache = cacheForRevision()
  const key = `${pack.id}@${pack.version}/${name}`
  let raw = cache.get(key)
  if (raw === undefined) {
    raw = await fs.readFile(packItemPath(pack, 'prompts', name), 'utf8')
    cache.set(key, raw)
  }
  return { raw, ...packSourceOf(pack) }
}
