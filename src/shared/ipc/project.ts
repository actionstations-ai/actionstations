import { z } from 'zod'
import { channel } from './define'
import { Brand, OpenProject, OrgType, RecentProject, Role } from '../schemas/project'
import { ProviderRouting } from '../schemas/provider'
import { patchOf } from '../schemas/common'

const ProjectPath = z.object({ path: z.string().min(1) })

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
}
