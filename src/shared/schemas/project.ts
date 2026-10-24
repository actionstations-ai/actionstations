import { z } from 'zod'
import { DomainProfileOverrides, DomainProfileSnapshot } from '../domains/schema'
import { Id, IsoDateTime, RelPath } from './common'
import { ProviderRouting } from './provider'

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
  domainProfileOverrides: DomainProfileOverrides.optional(),
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
