// Export as pack (#271, ADR-0018 "Export as pack"): the wizard that builds an .aspack from the
// user's own layers (user templates, global prompt overrides, user workflows) and from one
// project (its resolved domain profile under a new id, its documents with a license per file,
// the project itself as an example). Main collects, builds a deterministic zip, validates it
// with the pack reader and saves it through its own save dialog.
import { z } from 'zod'
import { channel } from './define'
import { HttpUrl } from '../schemas/common'
import {
  PACK_ITEM_ID,
  PackDomainId,
  PackId,
  PackItemSummary,
  PackProblem,
  PackTag,
  SemVer,
  SpdxExpression,
} from '../schemas/pack'

/**
 * Where packs are shared: a pull request to the site repository (docs/packs-format.md,
 * "Publishing to the official catalog"). Confirm the URL when the site repository goes public.
 */
export const PACK_CONTRIBUTION_URL = 'https://github.com/mdcrowley/actionstations-site'

/** Common pack licenses the wizard offers (any SPDX expression or LicenseRef-* is accepted). */
export const COMMON_PACK_LICENSES = [
  { id: 'CC-BY-4.0', label: 'Creative Commons Attribution 4.0' },
  { id: 'CC-BY-SA-4.0', label: 'Creative Commons Attribution-ShareAlike 4.0' },
  { id: 'CC0-1.0', label: 'CC0 1.0 (public domain dedication)' },
  { id: 'MIT', label: 'MIT' },
  { id: 'Apache-2.0', label: 'Apache 2.0' },
] as const

const ExportableItem = z.object({ id: z.string(), label: z.string() })

/** A project document as the license step lists it. */
export const ExportableDocument = z.object({
  id: z.string(),
  title: z.string(),
  filename: z.string(),
  /** The license the document already carries (a pack document), to prefill. */
  license: z.string().optional(),
  /** Why the file cannot go into a pack (type not allowed in documents/), if it cannot. */
  unsupported: z.string().optional(),
})
export type ExportableDocument = z.infer<typeof ExportableDocument>

export const ExportableProject = z.object({
  path: z.string(),
  name: z.string(),
  /** The domain profile the project resolves to (built-in, pack or snapshot). */
  domain: z.object({ id: z.string(), label: z.string(), builtin: z.boolean() }),
  documents: z.array(ExportableDocument),
  /** Suggested example slug (from the project name). */
  exampleSlug: z.string(),
  /** The banner text of the example the project was opened from, if any. */
  exampleNotice: z.string().optional(),
})
export type ExportableProject = z.infer<typeof ExportableProject>

/** What the "Choose items" step offers. */
export const PackExportSources = z.object({
  templates: z.array(ExportableItem),
  prompts: z.array(ExportableItem),
  workflows: z.array(ExportableItem),
  project: ExportableProject.optional(),
  /** Running app version: the pack's minAppVersion. */
  appVersion: z.string(),
  /** OS user name, lowercased to an id label, for the io.github.<user>.<name> suggestion. */
  suggestedUser: z.string(),
})
export type PackExportSources = z.infer<typeof PackExportSources>

export const PackExportMetadata = z.object({
  id: PackId,
  name: z.string().min(1).max(100),
  version: SemVer,
  summary: z.string().min(1).max(200),
  description: z.string().max(20_000).optional(),
  author: z.object({
    name: z.string().min(1).max(200),
    url: HttpUrl.optional(),
    email: z.email().optional(),
  }),
  /** Required, no default: the author chooses it (independent of the app's own license). */
  license: SpdxExpression,
  homepage: HttpUrl.optional(),
  domains: z.array(PackDomainId).max(50).default([]),
  tags: z.array(PackTag).max(20).default([]),
})
export type PackExportMetadata = z.infer<typeof PackExportMetadata>

/** One project document to include; `license` is checked in main so a gap gets a clear message. */
export const PackExportDocument = z.object({
  documentId: z.string().min(1),
  license: z.string().max(200).optional(),
  title: z.string().max(300).optional(),
  source: z.string().max(500).optional(),
})
export type PackExportDocument = z.infer<typeof PackExportDocument>

export const PackExportExample = z.object({
  slug: z
    .string()
    .regex(PACK_ITEM_ID.examples, 'Example ids are lowercase letters, digits, - and _'),
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(1000),
  /** Banner text shown in every project opened from the example (required). */
  notice: z.string().min(1).max(1000),
})
export type PackExportExample = z.infer<typeof PackExportExample>

export const PackExportRequest = z.object({
  metadata: PackExportMetadata,
  templates: z.array(z.string().regex(PACK_ITEM_ID.templates)).max(500).default([]),
  prompts: z.array(z.string().regex(PACK_ITEM_ID.prompts)).max(500).default([]),
  workflows: z.array(z.string().regex(PACK_ITEM_ID.workflows)).max(500).default([]),
  /** The project the domain, documents and example come from. */
  projectPath: z.string().min(1).optional(),
  /** Export the project's resolved domain profile under this new id. */
  domain: z.object({ id: PackDomainId, label: z.string().min(1).max(200) }).optional(),
  documents: z.array(PackExportDocument).max(500).default([]),
  example: PackExportExample.optional(),
  /** The author confirms they may redistribute everything in the pack under these licenses. */
  redistributeConfirmed: z.boolean(),
})
export type PackExportRequest = z.input<typeof PackExportRequest>

/** A file of the example project left out of the pack, and why (shown in the review). */
export const SkippedFile = z.object({ path: z.string(), reason: z.string() })

export const PackExportBuilt = z.object({
  ok: z.literal(true),
  /** <id>-<version>.aspack */
  fileName: z.string(),
  sha256: z.string(),
  size: z.number().int().nonnegative(),
  fileCount: z.number().int().nonnegative(),
  items: z.array(PackItemSummary),
  skipped: z.array(SkippedFile),
})
export type PackExportBuilt = z.infer<typeof PackExportBuilt>

export const PackExportRefused = z.object({ ok: z.literal(false), problems: z.array(PackProblem) })

export const PackExportCheckResult = z.discriminatedUnion('ok', [
  PackExportBuilt,
  PackExportRefused,
])
export type PackExportCheckResult = z.infer<typeof PackExportCheckResult>

export const PackExportSaveResult = z.union([
  PackExportBuilt.extend({ canceled: z.literal(false), path: z.string() }),
  z.object({ ok: z.literal(true), canceled: z.literal(true) }),
  PackExportRefused,
])
export type PackExportSaveResult = z.infer<typeof PackExportSaveResult>

export const packExportChannels = {
  /** What can be exported: user layers, and with projectPath that project's parts. */
  'packs:exportSources': channel(
    z.object({ projectPath: z.string().min(1).optional() }).optional(),
    PackExportSources,
  ),
  /** Build the pack in memory and validate it with the reader (the Review step). */
  'packs:exportCheck': channel(PackExportRequest, PackExportCheckResult),
  /** Build, validate, ask where to save (dialog in main) and write the .aspack. */
  'packs:exportSave': channel(PackExportRequest, PackExportSaveResult),
  /** Open the contribution page in the browser (only on a user click). */
  'packs:openContribution': channel(z.void(), z.void()),
}
