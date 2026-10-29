// The packs included with the app (ADR-0020, #314): read where the app ships them, never
// copied to userData. state.ts loads them at startup (before the installed packs, so their
// domain ids are reserved), applies the user's disabled list from registry.json, and the
// layer API (layers.ts) serves them.
//
//   packaged           app-resources/packs/<id>/ + index.json, written at build time by
//                      scripts/build-bundled-packs.mjs; each pack gets the quick check
//   TTX_BUNDLED_PACKS  the same layout in another folder (tests, e2e of the built packs)
//   unpackaged         "source mode": packs/bundled.json (compiled in) over the repo folders
//                      in place (resourcesDir(): templates/, prompts/, comfy/, examples/,
//                      packs/documents/), so editing a template in dev shows at once. Domain
//                      profiles come from packs/domains/*.json as compiled in. Files are
//                      hashed only when something asks for a sha256.
import { createHash } from 'node:crypto'
import { promises as fs, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { app } from 'electron'
import type { DomainProfile } from '@shared/domains'
import type { PackFile, PackItemSummary, PackKind, PackManifest } from '@shared/schemas/pack'
import { z } from 'zod'
import { AppError } from '../lib/errors'
import { safeJoin } from '../lib/fs'
import { resourcePath, resourcesDir } from '../lib/paths'
import { assembleBundledPacks, readmePath, type AssembledPack } from './bundled-assemble'
import {
  BUNDLED_INDEX_FILE,
  BUNDLED_INDEX_VERSION,
  BUNDLED_MAP,
  CORE_PACK_ID,
  bundledShortName,
  sourceDomainProfiles,
  type BundledMap,
} from './bundled-map'
import { readFolderManifest, verifyPackFolder } from './verify'
import pkg from '../../../package.json' with { type: 'json' }

/** Bundled packs are versioned with the app (source mode uses the version built in). */
export const BUNDLED_SOURCE_VERSION: string = pkg.version

/** A bundled pack as loaded (enabled state is applied by state.ts). */
export interface LoadedBundledPack {
  id: string
  version: string
  name: string
  core: boolean
  /** The pack folder (built packs) or the resources root (source mode). */
  dir: string
  manifest: PackManifest
  items: readonly PackItemSummary[]
  domains: DomainProfile[]
  /** Source mode: maps a path inside the pack to the repo file or folder. */
  resolve?: (packPath: string) => string
  /** Why the pack cannot be used (a built pack folder failed the quick check). */
  broken?: string
}

/** Where the built bundled packs are, or undefined for source mode. */
export function bundledPacksDir(): string | undefined {
  if (process.env.TTX_BUNDLED_PACKS) return resolve(process.env.TTX_BUNDLED_PACKS)
  return app?.isPackaged ? resourcePath('packs') : undefined
}

/**
 * A folder of the core pack (its prompts or workflows): where the default prompt and
 * workflow layers read. Known without loading the packs: built packs keep the pack layout,
 * source mode reads the repo folders.
 */
export function coreFolder(folder: 'prompts' | 'workflows'): string {
  const dir = bundledPacksDir()
  if (dir) return join(dir, CORE_PACK_ID, folder)
  return folder === 'prompts' ? resourcePath('prompts') : resourcePath('comfy', 'workflows')
}

// ---- built packs -------------------------------------------------------------------------

const IndexSchema = z.object({
  formatVersion: z.literal(BUNDLED_INDEX_VERSION),
  appVersion: z.string(),
  packs: z.array(
    z.object({ id: z.string(), core: z.boolean(), items: z.array(z.any()).default([]) }),
  ),
})

async function loadBuiltOne(
  root: string,
  ref: { id: string; core: boolean; items: PackItemSummary[] },
): Promise<LoadedBundledPack> {
  const dir = safeJoin(root, ref.id)
  const base = { id: ref.id, core: ref.core, dir, items: ref.items, domains: [] }
  const manifest = await readFolderManifest(dir)
  if (typeof manifest === 'string')
    return {
      ...base,
      version: '0.0.0',
      name: ref.id,
      manifest: emptyManifest(ref.id),
      broken: manifest,
    }
  const v = await verifyPackFolder(dir, manifest)
  const loaded = { ...base, version: manifest.version, name: manifest.name, manifest }
  return v.ok ? { ...loaded, domains: v.domains } : { ...loaded, broken: v.problem }
}

async function loadBuilt(root: string): Promise<LoadedBundledPack[]> {
  let index: z.infer<typeof IndexSchema>
  try {
    index = IndexSchema.parse(JSON.parse(await fs.readFile(join(root, BUNDLED_INDEX_FILE), 'utf8')))
  } catch (e) {
    console.error(`[packs] the bundled packs in ${root} cannot be read:`, (e as Error).message)
    return []
  }
  const packs = await Promise.all(
    index.packs.map((p) =>
      loadBuiltOne(root, p as { id: string; core: boolean; items: PackItemSummary[] }),
    ),
  )
  for (const p of packs)
    if (p.broken) console.error(`[packs] bundled pack ${p.id} is damaged: ${p.broken}`)
  return packs
}

function emptyManifest(id: string): PackManifest {
  return {
    formatVersion: 1,
    id,
    name: id,
    version: '0.0.0',
    summary: '',
    description: '',
    author: BUNDLED_MAP.author,
    license: BUNDLED_MAP.license,
    minAppVersion: '0.0.0',
    domains: [],
    tags: [],
    contents: {
      templates: [],
      prompts: [],
      domains: [],
      workflows: [],
      documents: [],
      examples: [],
      regulations: [],
      frameworks: [],
    },
    documents: [],
    files: [],
  }
}

// ---- source mode -------------------------------------------------------------------------

/** Where each pack path prefix lives in the repo (source mode). */
function sourceResolver(root: string, id: string): (packPath: string) => string {
  const prefixes: [string, string[]][] = [
    ['templates/', ['templates', 'injects']],
    ['prompts/', ['prompts']],
    ['workflows/', ['comfy', 'workflows']],
    ['domains/', ['packs', 'domains']],
    ['examples/', ['examples']],
    ['documents/', ['packs', 'documents', bundledShortName(id)]],
    ['regulations/', ['packs', 'regulations']],
    ['frameworks/', ['packs', 'frameworks']],
  ]
  return (packPath) => {
    if (packPath === 'README.md') return readmePath(root, id)
    for (const [prefix, folder] of prefixes)
      if (packPath.startsWith(prefix))
        return safeJoin(join(root, ...folder), ...packPath.slice(prefix.length).split('/'))
    throw new AppError('NOT_FOUND', `${id} has no file ${packPath}`)
  }
}

/** files[] whose sha256 is computed on first read (source mode reads the repo in place). */
function lazyFiles(pack: AssembledPack): PackFile[] {
  return pack.files.map((f) => {
    let hash: string | undefined
    return {
      path: f.path,
      size: f.size,
      get sha256(): string {
        hash ??= createHash('sha256').update(readFileSync(f.source)).digest('hex')
        return hash
      },
    }
  })
}

function sourceItems(
  manifest: PackManifest,
  profiles: Map<string, DomainProfile>,
): PackItemSummary[] {
  const kinds = Object.keys(manifest.contents) as PackKind[]
  return kinds.flatMap((kind) =>
    manifest.contents[kind].map((id) => ({
      kind,
      id,
      title: kind === 'domains' ? (profiles.get(id)?.label ?? id) : id,
      replacesBuiltin: false,
      license: manifest.license,
      size: manifest.files
        .filter((f) => f.path.startsWith(`${kind}/${id}`))
        .reduce((n, f) => n + f.size, 0),
    })),
  )
}

/** Source mode: the map over the resources folder; domains always from the compiled-in JSON. */
export function loadSourcePacks(
  appVersion: string,
  map: BundledMap = BUNDLED_MAP,
): LoadedBundledPack[] {
  let root: string | undefined
  try {
    root = resourcesDir()
  } catch {
    root = undefined // no app path (plain Node tests without TTX_RESOURCES): domains only
  }
  const assembled = root ? assembleBundledPacks(map, { root, appVersion, strict: false }).packs : []
  const profiles = sourceDomainProfiles()
  return map.packs.flatMap((spec): LoadedBundledPack[] => {
    const a = assembled.find((p) => p.manifest.id === spec.id)
    const domainIds = spec.contents.domains.filter((d) => profiles.has(d))
    if (!a && !domainIds.length) return []
    const base = a?.manifest ?? emptyManifest(spec.id)
    const manifest: PackManifest = {
      ...base,
      name: spec.name,
      summary: spec.summary,
      description: spec.description,
      version: appVersion,
      minAppVersion: appVersion,
      domains: spec.domains,
      tags: spec.tags,
      contents: { ...base.contents, domains: domainIds },
      files: a ? lazyFiles(a) : [],
    }
    return [
      {
        id: spec.id,
        version: appVersion,
        name: spec.name,
        core: spec.core,
        dir: root ?? '',
        manifest,
        items: sourceItems(manifest, profiles),
        domains: domainIds.map((d) => profiles.get(d)!),
        ...(root ? { resolve: sourceResolver(root, spec.id) } : {}),
      },
    ]
  })
}

// ---- entry ---------------------------------------------------------------------------------

/** Load every bundled pack: built (packaged, TTX_BUNDLED_PACKS) or from source. */
export async function loadBundledPacks(): Promise<LoadedBundledPack[]> {
  const dir = bundledPacksDir()
  return dir ? loadBuilt(dir) : loadSourcePacks(BUNDLED_SOURCE_VERSION)
}
