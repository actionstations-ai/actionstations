import { z } from 'zod'
import { channel } from './define'
import { Brand, OpenProject, OrgType, RecentProject, Role } from '../schemas/project'
import { ProviderRouting } from '../schemas/provider'
import { patchOf, SafeId } from '../schemas/common'

const ProjectPath = z.object({ path: z.string().min(1) })

/** Where an extracted fact was found (#155). */
export const FacilityFactSource = z.object({
  documentId: z.string(),
  documentTitle: z.string(),
  /** Nearest heading above the first mention ("" when the document has none). */
  section: z.string(),
})
export type FacilityFactSource = z.infer<typeof FacilityFactSource>

/** One category of facility-facts.md as the editor shows it (#155). */
export const FacilityFactCategory = z.object({
  id: z.string(),
  label: z.string(),
  /** The entries in the file, in file order. */
  entries: z.array(z.string()),
  /** What extraction from the documents gives right now (entries not here were added). */
  extracted: z.array(z.string()),
  /** Extracted entry → where it was found, when known. */
  sources: z.record(z.string(), FacilityFactSource),
  /** Generated rows naming an identifier of this kind outside the list get FACILITY_UNKNOWN_ID. */
  linted: z.boolean(),
})
export type FacilityFactCategory = z.infer<typeof FacilityFactCategory>

/** Limits for one save (#155): entries are single lines in a Markdown bullet list. */
export const FACILITY_LIMITS = {
  categories: 100,
  entriesPerCategory: 2000,
  entryLength: 200,
  labelLength: 80,
} as const

/** A category as the editor saves it. Entries are trimmed, de-duplicated and blanks dropped. */
export const FacilityFactCategoryInput = z.object({
  id: SafeId.max(64),
  label: z.string().trim().min(1).max(FACILITY_LIMITS.labelLength),
  entries: z
    .array(z.string().max(FACILITY_LIMITS.entryLength))
    .max(FACILITY_LIMITS.entriesPerCategory),
})
export type FacilityFactCategoryInput = z.infer<typeof FacilityFactCategoryInput>

/** <project>/facility-facts.md (#143): the identifiers the generator treats as real. */
export const FacilityFactsFile = z.object({
  /** Project-root-relative path ("facility-facts.md"). */
  path: z.string(),
  markdown: z.string(),
  /** The designer changed the file since it was generated; re-ingest no longer overwrites it. */
  edited: z.boolean(),
  /** The newer extraction (facility-facts.generated.md) when an edited file was kept. */
  generatedMarkdown: z.string().optional(),
  /** The file parsed into categories, with the extraction beside it (#155). */
  categories: z.array(FacilityFactCategory),
  /** Hash of `markdown`; a save that names an older revision is refused (CONFLICT). */
  revision: z.string(),
  /** Earlier versions kept in .cache/facility-facts-history/ (newest first, at most 20). */
  historyCount: z.number().int().nonnegative(),
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
  /**
   * Write facility-facts.md from the editor (#155). The previous file goes to the history;
   * `revision` (from the last read) guards against overwriting a change made on disk.
   */
  'project:facility-facts-save': channel(
    ProjectPath.extend({
      revision: z.string().optional(),
      categories: z.array(FacilityFactCategoryInput).max(FACILITY_LIMITS.categories),
    }),
    FacilityFactsFile,
  ),
}
