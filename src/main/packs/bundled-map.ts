// The bundled-pack map (ADR-0020): packs/bundled.json says which of the repo's templates,
// prompts, workflows, domain profiles, examples and documents go into which pack included
// with the app, plus each pack's metadata. scripts/build-bundled-packs.mjs assembles the packs
// from it at build time (bundled-build.ts); an unpackaged run (dev, unit tests, e2e) reads the
// same map and the repo folders in place (bundled.ts, "source mode"). Pure: no Electron.
import { z } from 'zod'
import { HttpUrl } from '@shared/schemas/common'
import {
  PackAuthor,
  PackDomainId,
  PackId,
  PackTag,
  SpdxExpression,
  type PackItemSummary,
  type PackKind,
} from '@shared/schemas/pack'
import { DomainProfile } from '@shared/domains/schema'
import rawMap from '../../../packs/bundled.json' with { type: 'json' }

export const BUNDLED_INDEX_FILE = 'index.json'
export const BUNDLED_INDEX_VERSION = 1

/** out/bundled-packs/index.json (app-resources/packs/index.json in a release). */
export interface BundledIndex {
  formatVersion: typeof BUNDLED_INDEX_VERSION
  appVersion: string
  /** Packs in map order, with the reader's item summaries (titles for the Packs screen). */
  packs: { id: string; core: boolean; items: PackItemSummary[] }[]
}

/** Bundled ids start with this; the rest names the pack's documents folder. */
export const BUNDLED_ID_PREFIX = 'ai.actionstations.'
export const CORE_PACK_ID = 'ai.actionstations.core'

/** The only licenses a bundled document may carry (owner decision, ADR-0020). */
export const BUNDLED_DOCUMENT_LICENSES = ['LicenseRef-US-Government-Work', 'CC0-1.0'] as const

/** Installer budget for documents across all bundled packs (ADR-0020). */
export const BUNDLED_DOCUMENTS_MAX_BYTES = 60 * 1024 * 1024

const Ids = (re: RegExp) => z.array(z.string().regex(re)).default([])

/** One document file: `<slug>/<file>` under packs/documents/<pack>/. */
export const BundledDocument = z.strictObject({
  path: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}\/[A-Za-z0-9_][A-Za-z0-9_.-]*$/),
  title: z.string().min(1).max(300),
  license: z.enum(BUNDLED_DOCUMENT_LICENSES),
  publisher: z.string().min(1).max(200),
  url: HttpUrl,
  description: z.string().max(2000).optional(),
})
export type BundledDocument = z.infer<typeof BundledDocument>

export const BundledPackSpec = z.strictObject({
  id: PackId.refine((id) => id.startsWith(BUNDLED_ID_PREFIX), {
    message: `Bundled pack ids start with ${BUNDLED_ID_PREFIX}`,
  }),
  name: z.string().min(1).max(100),
  summary: z.string().min(1).max(200),
  description: z.string().max(20_000).default(''),
  /** The core pack: always enabled, cannot be disabled. Exactly one. */
  core: z.boolean().default(false),
  tags: z.array(PackTag).max(20).default([]),
  /** Domain ids the pack is for (scopes its prompts); empty for core. */
  domains: z.array(PackDomainId).max(50).default([]),
  contents: z.strictObject({
    templates: Ids(/^[a-z0-9_]+$/),
    prompts: Ids(/^[a-z][a-z0-9_]*$/),
    domains: Ids(/^[a-z][a-z0-9_]*$/),
    workflows: Ids(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    examples: Ids(/^[a-z0-9][a-z0-9_-]{0,63}$/),
    regulations: Ids(/^[a-z][a-z0-9_]{0,63}$/),
    frameworks: Ids(/^[a-z][a-z0-9_]{0,63}$/),
  }),
  documents: z.array(BundledDocument).default([]),
})
export type BundledPackSpec = z.infer<typeof BundledPackSpec>

export const BundledMap = z
  .object({
    author: PackAuthor,
    license: SpdxExpression,
    homepage: HttpUrl.optional(),
    packs: z.array(BundledPackSpec).min(1),
  })
  .superRefine((m, ctx) => {
    if (m.packs.filter((p) => p.core).length !== 1)
      ctx.addIssue({ code: 'custom', path: ['packs'], message: 'Exactly one pack is the core' })
    const ids = m.packs.map((p) => p.id)
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', path: ['packs'], message: 'Duplicate bundled pack id' })
  })
export type BundledMap = z.infer<typeof BundledMap>

/** The packs/bundled.json compiled into this build. */
export const BUNDLED_MAP: BundledMap = BundledMap.parse(rawMap)

/** Whether an id belongs to a pack included with the app (installed packs may not use it). */
export const isBundledPackId = (id: string): boolean =>
  id.startsWith(BUNDLED_ID_PREFIX) && BUNDLED_MAP.packs.some((p) => p.id === id)

export const isCorePackId = (id: string): boolean => id === CORE_PACK_ID

/** The documents folder name of a bundled pack: its id without the prefix. */
export const bundledShortName = (id: string): string => id.slice(BUNDLED_ID_PREFIX.length)

/** Document group slugs of a pack spec (the first path segment of each document). */
export const documentSlugs = (spec: BundledPackSpec): string[] => [
  ...new Set(spec.documents.map((d) => d.path.split('/')[0]!)),
]

/** The item ids a pack spec lists for one kind (documents: the slugs). */
export function specItems(spec: BundledPackSpec, kind: PackKind): string[] {
  return kind === 'documents' ? documentSlugs(spec) : spec.contents[kind]
}

// The domain profiles as data, compiled in so source mode and tests have them without a build.
const PROFILE_FILES = import.meta.glob<unknown>('../../../packs/domains/*.json', {
  eager: true,
  import: 'default',
})

/** packs/domains/<id>.json as compiled into this build, by id. */
export function sourceDomainProfiles(): Map<string, DomainProfile> {
  const out = new Map<string, DomainProfile>()
  for (const [path, raw] of Object.entries(PROFILE_FILES)) {
    const id = path.slice(path.lastIndexOf('/') + 1, -'.json'.length)
    out.set(id, DomainProfile.parse(raw))
  }
  return out
}

/**
 * The bundled domain profiles as the map assigns them (picker order: bundled.json order, the
 * core's generic last), every pack enabled. Tests register these; main registers the loaded
 * packs' profiles with the user's enabled state.
 */
export function sourceBundledProfileEntries(
  version: string,
  map: BundledMap = BUNDLED_MAP,
): {
  profile: DomainProfile
  packId: string
  packVersion: string
  packName: string
  enabled: boolean
}[] {
  const profiles = sourceDomainProfiles()
  const ordered = [...map.packs.filter((p) => !p.core), ...map.packs.filter((p) => p.core)]
  return ordered.flatMap((spec) =>
    spec.contents.domains.flatMap((id) => {
      const profile = profiles.get(id)
      return profile
        ? [{ profile, packId: spec.id, packVersion: version, packName: spec.name, enabled: true }]
        : []
    }),
  )
}
