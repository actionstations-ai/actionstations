// Plan redlines (#431): a proposed edit of one plan section, drafted from an AAR/IP area for
// improvement, edited and accepted by the designer, and exported as tracked changes in the
// plan's own DOCX or as a change memo. The ingested original is never modified. Stored as
// <project>/redlines/<id>.json; loose so a newer build's fields survive a save (ADR-0016).
import { z } from 'zod'
import { CoreCapabilityId } from '../core-capabilities'
import { Id, IsoDateTime } from './common'
import { GroundingLabel } from './grounding'
import { StageRun } from './scenario'

export const REDLINE_LIMITS = {
  excerpt: 20_000,
  proposed: 20_000,
  rationale: 2000,
  note: 1000,
  list: 200,
  history: 200,
} as const

export const REDLINE_STATUSES = [
  'proposed',
  'accepted',
  'rejected',
  'exported',
  'applied',
  'not_applied',
  'needs_review',
] as const
export const RedlineStatus = z.enum(REDLINE_STATUSES)
export type RedlineStatus = z.infer<typeof RedlineStatus>

export const REDLINE_STATUS_LABELS: Record<RedlineStatus, string> = {
  proposed: 'Proposed',
  accepted: 'Accepted',
  rejected: 'Rejected',
  exported: 'Exported',
  applied: 'Applied in the new plan',
  not_applied: 'Not applied',
  needs_review: 'Needs review',
}

export const REDLINE_SOURCE_KINDS = [
  'docx',
  'pdf',
  'pptx',
  'xlsx',
  'markdown',
  'text',
  'html',
  'image',
] as const
export const RedlineSourceKind = z.enum(REDLINE_SOURCE_KINDS)
export type RedlineSourceKind = z.infer<typeof RedlineSourceKind>

export const Redline = z.looseObject({
  formatVersion: z.number().int().default(1),
  id: Id,
  projectId: Id,
  source: z.object({
    scenarioId: Id,
    scenarioTitle: z.string().max(500),
    /** The AAR area for improvement (`Finding.id`) the proposal answers. */
    findingId: Id.optional(),
    capability: CoreCapabilityId.optional(),
    /** `CorrectiveAction.id` of the AAR/IP. */
    aarCorrectiveActionIds: z.array(Id).max(REDLINE_LIMITS.list).default([]),
    /** Program corrective action ids, when the AAR was imported into a program (#424). */
    correctiveActionIds: z.array(Id).max(REDLINE_LIMITS.list).default([]),
    /** Criteria (#421) rated not met or partial that this proposal should fix. */
    criterionIds: z.array(z.string().max(200)).max(REDLINE_LIMITS.list).default([]),
    sessionId: Id.optional(),
  }),
  target: z.object({
    documentId: Id,
    documentTitle: z.string().max(500),
    documentSha256: z.string().max(100).optional(),
    headingPath: z.string().max(1000),
    page: z.number().int().positive().optional(),
    /** 'docx' can carry tracked changes; anything else gets a change memo. */
    sourceKind: RedlineSourceKind,
  }),
  /** Verbatim from the ingested text; compared with whitespace and quotes normalized. */
  originalExcerpt: z.string().min(1).max(REDLINE_LIMITS.excerpt),
  proposedText: z.string().min(1).max(REDLINE_LIMITS.proposed),
  rationale: z.string().max(REDLINE_LIMITS.rationale).default(''),
  grounding: GroundingLabel.optional(),
  status: RedlineStatus.default('proposed'),
  history: z
    .array(
      z.object({
        at: IsoDateTime,
        to: RedlineStatus,
        note: z.string().max(REDLINE_LIMITS.note).default(''),
      }),
    )
    .max(REDLINE_LIMITS.history)
    .default([]),
  export: z
    .object({
      at: IsoDateTime,
      file: z.string().max(1000),
      mode: z.enum(['tracked', 'memo']),
      originalSha256: z.string().max(100),
    })
    .optional(),
  appliedCheck: z
    .object({
      at: IsoDateTime,
      documentId: Id,
      result: z.enum(['applied', 'not_applied', 'needs_review']),
    })
    .optional(),
  by: z.enum(['ai', 'user']),
  provenance: StageRun.optional(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
})
export type Redline = z.infer<typeof Redline>

/** The fields a new proposal arrives with; the rest (id, status, history, dates) is set by main. */
export const NewRedline = z.object(
  Redline.pick({
    projectId: true,
    source: true,
    target: true,
    originalExcerpt: true,
    proposedText: true,
    rationale: true,
    grounding: true,
    provenance: true,
  }).shape,
)
export type NewRedline = z.infer<typeof NewRedline>

/** What the export of one redline produced. */
export const RedlineExportEntry = z.object({
  id: Id,
  mode: z.enum(['tracked', 'memo']),
  file: z.string(),
  /** Why a DOCX plan got a memo entry (paragraphs not found, inside a table, ...). */
  reason: z.string().optional(),
})
export type RedlineExportEntry = z.infer<typeof RedlineExportEntry>

export const RedlineExportResult = z.object({
  files: z.array(z.string()),
  perRedline: z.array(RedlineExportEntry),
})
export type RedlineExportResult = z.infer<typeof RedlineExportResult>
