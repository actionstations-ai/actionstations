import { z } from 'zod'
import { ProjectCompliance } from './compliance'
import {
  DomainProfileOverrides,
  DomainProfileSnapshot,
  withoutLegacyEmptyOverrides,
} from '../domains/schema'
import { Id, IsoDateTime, RelPath } from './common'
import { PackId, PackPath, SemVer } from './pack'
import { ProjectPrivacy } from './privacy'
import { ProviderRouting } from './provider'
import { HotwashSettings } from './hotwash'

export const PROJECT_FORMAT_VERSION = 1

/**
 * Persisted root objects (project.json, scenario.json, inject and document meta files) are
 * loose: keys this build does not know are kept on load and written back on save, so an older
 * build never deletes fields a newer one added (#208). Known fields are still validated.
 */

/**
 * Built-in domain profile ids (src/shared/domains) plus the legacy values ('hospital',
 * 'utility') that resolve to one as aliases; any other string resolves to the generic profile.
 */
export const ORG_TYPE_IDS = [
  'airport',
  'transit',
  'water_dam',
  'water_utility',
  'energy_utility',
  'healthcare',
  'campus',
  'stadium_venue',
  'port_maritime',
  'municipal',
  'industrial',
  'unmanned_systems',
  'generic',
] as const
export const OrgType = z.union([
  z.enum([...ORG_TYPE_IDS, 'hospital', 'utility']),
  z.string().min(1),
])

export const Brand = z.object({
  logoPath: RelPath.optional(),
  primaryColor: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  /** e.g. { airlineA: "Delta", localTv: "Channel 5" } — templates read these instead of hard-coding. */
  aliases: z.record(z.string(), z.string()).default({}),
})
export type Brand = z.infer<typeof Brand>

export const Role = z.object({
  id: Id,
  name: z.string().min(1),
  abbreviation: z.string().default(''),
  team: z.string().default(''),
  description: z.string().default(''),
  standingOrders: z.array(z.string()).default([]),
})
export type Role = z.infer<typeof Role>

export const DocumentKind = z.enum([
  'plan',
  'policy',
  'map',
  'form',
  'course',
  'prior_exercise',
  'other',
])
export type DocumentKind = z.infer<typeof DocumentKind>

export const DocumentStatus = z.enum(['pending', 'parsing', 'embedding', 'ok', 'error'])

/** Where a document imported from an installed pack came from (ADR-0018, #265). */
export const DocumentPackSource = z.object({
  packId: PackId,
  version: SemVer,
  /** The file's path inside the pack, e.g. documents/<slug>/<file>. */
  path: PackPath,
  /** Pack display name at import time, for the label after the pack is gone. */
  packName: z.string().max(100).optional(),
})
export type DocumentPackSource = z.infer<typeof DocumentPackSource>

export const DocumentMeta = z.looseObject({
  id: Id,
  title: z.string(),
  /** Short label used in citations, e.g. "TIRP". */
  shortName: z.string().optional(),
  filename: z.string(),
  mimeType: z.string().optional(),
  kind: DocumentKind.default('other'),
  pages: z.number().int().nonnegative().default(0),
  ingestedAt: IsoDateTime.optional(),
  status: DocumentStatus.default('pending'),
  error: z.string().optional(),
  tags: z.array(z.string()).default([]),
  headingsPreview: z.array(z.string()).default([]),
  sha256: z.string().optional(),
  chunkCount: z.number().int().nonnegative().default(0),
  /** Set when the document was added from an installed pack; the copy is the project's own. */
  source: DocumentPackSource.optional(),
  /** SPDX license of a pack document (from the pack's documents[] entry). */
  license: z.string().max(200).optional(),
})
export type DocumentMeta = z.infer<typeof DocumentMeta>

export const ScenarioMeta = z.object({
  id: Id,
  title: z.string(),
  status: z.enum(['draft', 'ready', 'archived']).default('draft'),
  updatedAt: IsoDateTime,
})
export type ScenarioMeta = z.infer<typeof ScenarioMeta>

export const Project = z.looseObject({
  formatVersion: z
    .number()
    .int()
    .default(PROJECT_FORMAT_VERSION)
    .refine((v) => v <= PROJECT_FORMAT_VERSION, {
      message: `This project was created by a newer version of Action Stations (format newer than ${PROJECT_FORMAT_VERSION}). Update the app to open it.`,
    }),
  id: Id,
  name: z.string().min(1),
  orgName: z.string().default(''),
  orgType: OrgType.default('generic'),
  /** Project-level edits to the built-in domain profile orgType selects (ADR-0014). */
  /** Empty values written by builds before #180 are dropped on load. */
  domainProfileOverrides: z.preprocess(
    withoutLegacyEmptyOverrides,
    DomainProfileOverrides.optional(),
  ),
  /** The pack domain profile orgType names, copied when it was chosen (ADR-0018, #263). */
  domainProfileSnapshot: DomainProfileSnapshot.optional(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  appVersion: z.string(),
  archived: z.boolean().default(false),
  brand: Brand.default({ aliases: {} }),
  defaultRoles: z.array(Role).default([]),
  providerRouting: ProviderRouting.default({}),
  promptOverrides: z.array(z.string()).default([]),
  documents: z.array(DocumentMeta).default([]),
  scenarios: z.array(ScenarioMeta).default([]),
  /** Overrides of the global cloud review and redaction settings (#433). */
  privacy: ProjectPrivacy.optional(),
  /** Regulations and frameworks switched on or off for this project (#426); absent = profile defaults. */
  compliance: ProjectCompliance.optional(),
  /** Hot wash recording options (#425); absent until first changed. */
  hotwash: HotwashSettings.optional(),
})
export type Project = z.infer<typeof Project>

/** A project as returned to the renderer: data plus where it lives. */
export const OpenProject = z.object({ path: z.string(), project: Project })
export type OpenProject = z.infer<typeof OpenProject>

export const RecentProject = z.object({
  path: z.string(),
  name: z.string(),
  orgName: z.string().default(''),
  openedAt: IsoDateTime,
  archived: z.boolean().default(false),
})
export type RecentProject = z.infer<typeof RecentProject>
