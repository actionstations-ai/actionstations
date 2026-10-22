import type { ChannelRequestParsed } from '@shared/ipc'
import type { Brand, Project } from '@shared/schemas'

export type ProjectPatch = ChannelRequestParsed<'project:update'>['patch']

/** Drop keys whose value is undefined so a spread never overwrites stored data with nothing. */
function definedOnly<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>
}

/** Brand is a shallow patch: fields sent replace stored ones, omitted fields are kept. */
export function mergeBrand(stored: Brand, patch: NonNullable<ProjectPatch['brand']>): Brand {
  return { ...stored, ...definedOnly(patch) }
}

/** Apply a project:update patch to a draft project (mutates and returns it). */
export function applyProjectPatch(draft: Project, patch: ProjectPatch): Project {
  if (patch.name !== undefined) draft.name = patch.name
  if (patch.orgName !== undefined) draft.orgName = patch.orgName
  if (patch.orgType !== undefined) draft.orgType = patch.orgType
  if (patch.domainProfileOverrides === null) delete draft.domainProfileOverrides
  else if (patch.domainProfileOverrides) draft.domainProfileOverrides = patch.domainProfileOverrides
  if (patch.brand) draft.brand = mergeBrand(draft.brand, patch.brand)
  if (patch.defaultRoles) draft.defaultRoles = patch.defaultRoles
  if (patch.providerRouting) draft.providerRouting = patch.providerRouting
  return draft
}
