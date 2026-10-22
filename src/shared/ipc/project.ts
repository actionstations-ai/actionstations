import { z } from 'zod'
import { channel } from './define'
import { Brand, OpenProject, OrgType, RecentProject, Role } from '../schemas/project'
import { ProviderRouting } from '../schemas/provider'
import { patchOf } from '../schemas/common'

const ProjectPath = z.object({ path: z.string().min(1) })

/** <project>/facility-facts.md (#143): the identifiers the generator treats as real. */
export const FacilityFactsFile = z.object({
  /** Project-root-relative path ("facility-facts.md"). */
  path: z.string(),
  markdown: z.string(),
  /** The designer changed the file since it was generated; re-ingest no longer overwrites it. */
  edited: z.boolean(),
  /** The newer extraction (facility-facts.generated.md) when an edited file was kept. */
  generatedMarkdown: z.string().optional(),
})
export type FacilityFactsFile = z.infer<typeof FacilityFactsFile>

export const projectChannels = {
  'project:list-recent': channel(z.void(), z.array(RecentProject)),
  'project:create': channel(
    z.object({
      parentDir: z.string().min(1),
      name: z.string().min(1).max(120),
      orgName: z.string().default(''),
      orgType: OrgType.default('generic'),
    }),
    OpenProject,
  ),
  'project:open': channel(ProjectPath, OpenProject),
  'project:get': channel(ProjectPath, OpenProject),
  'project:update': channel(
    ProjectPath.extend({
      patch: z.object({
        name: z.string().min(1).optional(),
        orgName: z.string().optional(),
        orgType: OrgType.optional(),
        /** Shallow patch: fields sent replace stored ones; omitted fields are kept. */
        brand: patchOf(Brand).optional(),
        defaultRoles: z.array(Role).optional(),
        providerRouting: ProviderRouting.optional(),
      }),
    }),
    OpenProject,
  ),
  'project:duplicate': channel(
    ProjectPath.extend({ newName: z.string().min(1), parentDir: z.string().optional() }),
    OpenProject,
  ),
  'project:archive': channel(ProjectPath.extend({ archived: z.boolean() }), OpenProject),
  'project:forget-recent': channel(ProjectPath, z.array(RecentProject)),
  /** Read facility-facts.md (written from the documents first when it does not exist). */
  'project:facility-facts': channel(ProjectPath, FacilityFactsFile),
  /** Discard the designer's edits: rewrite facility-facts.md from the documents. */
  'project:facility-facts-reset': channel(ProjectPath, FacilityFactsFile),
}
