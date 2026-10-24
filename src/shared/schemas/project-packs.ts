// <project>/packs.json (ADR-0018 § Uninstall): what a project copied out of installed packs.
// A template, workflow, document, domain profile or example used from a pack is copied into the
// project's own layer the first time it is used, so the project keeps working after the pack is
// updated or uninstalled. Each copy records the pack and the sha256 of every copied file, which
// tells "edited" (a file no longer matches) and "update available" (the pack has a newer version).
import { z } from 'zod'
import { IsoDateTime } from './common'
import { PackId, PackKind, SemVer, Sha256Hex } from './pack'

export const PROJECT_PACKS_FILE = 'packs.json'

/** Prompts are never copied: they shape new generation only (ADR-0018). */
export const CopiedPackKind = PackKind.exclude(['prompts'])
export type CopiedPackKind = z.infer<typeof CopiedPackKind>

export const ProjectPackCopy = z.object({
  kind: CopiedPackKind,
  /** The item id in the pack (template type, workflow id, document slug, domain id, example slug). */
  id: z.string().min(1).max(128),
  packId: PackId,
  version: SemVer,
  /** Pack display name when copied, for badges after the pack is gone. */
  packName: z.string().max(100).optional(),
  copiedAt: IsoDateTime,
  /** Project-relative POSIX paths of the copied files and their sha256 at copy time. */
  files: z.array(z.object({ path: z.string().min(1), sha256: Sha256Hex })),
})
export type ProjectPackCopy = z.infer<typeof ProjectPackCopy>

export const ProjectPacks = z.looseObject({
  copies: z.array(ProjectPackCopy).default([]),
})
export type ProjectPacks = z.infer<typeof ProjectPacks>

/** Where a project copy stands against its files and the installed pack. */
export const PackCopyState = z.object({
  /** Some copied file is missing or its sha256 differs from the record. */
  edited: z.boolean(),
  /** The pack is not installed (or disabled). */
  packMissing: z.boolean(),
  /** The installed pack has a newer version than the copy. */
  updateAvailable: z.boolean(),
  installedVersion: SemVer.optional(),
})
export type PackCopyState = z.infer<typeof PackCopyState>
