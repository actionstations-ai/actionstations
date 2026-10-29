// What goes to cloud providers (#433): review policy, redaction settings, the outbound manifest
// the approval dialog shows, and one line of the per-project send log (cloud-sends.jsonl).
import { z } from 'zod'
import { Id, IsoDateTime } from './common'

export const REDACTION_CATEGORIES = ['person', 'phone', 'email', 'address'] as const
export const RedactionCategory = z.enum(REDACTION_CATEGORIES)
export type RedactionCategory = z.infer<typeof RedactionCategory>

/**
 * When the app asks before a request goes to a cloud provider.
 * `new-excerpts` (default): the first request of a job, then any request carrying a plan
 * excerpt not yet approved in that job. `every-request`, `per-job` and `off` are literal.
 */
export const ReviewPolicy = z.enum(['new-excerpts', 'every-request', 'per-job', 'off'])
export type ReviewPolicy = z.infer<typeof ReviewPolicy>

const Term = z.string().trim().min(2).max(200)

export const PrivacySettings = z.object({
  review: ReviewPolicy.default('new-excerpts'),
  /** Categories missing here are on (open question 3: redaction on by default). */
  redact: z.partialRecord(RedactionCategory, z.boolean()).default({}),
  alwaysRedact: z.array(Term).max(500).default([]),
  neverRedact: z.array(Term).max(500).default([]),
})
export type PrivacySettings = z.infer<typeof PrivacySettings>

/** A project's overrides: any field it sets wins over the global default. */
export const ProjectPrivacy = z.object({
  review: ReviewPolicy.optional(),
  redact: z.partialRecord(RedactionCategory, z.boolean()).optional(),
  alwaysRedact: z.array(Term).max(500).optional(),
  neverRedact: z.array(Term).max(500).optional(),
})
export type ProjectPrivacy = z.infer<typeof ProjectPrivacy>

export const OutboundExcerpt = z.object({
  chunkId: z.number().int(),
  documentId: Id,
  documentTitle: z.string(),
  headingPath: z.string(),
  page: z.number().int().optional(),
  chars: z.number().int(),
  /** The excerpt as it will be sent (after redaction). */
  text: z.string(),
})
export type OutboundExcerpt = z.infer<typeof OutboundExcerpt>

export const RedactionSpan = z.object({
  /** Which part (or `excerpt:<chunkId>`) the offsets refer to; offsets index the sent text. */
  part: z.string(),
  start: z.number().int(),
  end: z.number().int(),
  category: RedactionCategory,
  placeholder: z.string(),
  /** The hidden value. Local IPC only, for the approval dialog; never sent or logged. */
  original: z.string(),
})
export type RedactionSpan = z.infer<typeof RedactionSpan>

export const OutboundKind = z.enum(['chat', 'embed', 'media'])
export type OutboundKind = z.infer<typeof OutboundKind>

export const OutboundManifest = z.object({
  requestId: z.string(),
  /** SHA-256 of the exact request content; privacy:decide must echo it back. */
  requestHash: z.string(),
  jobId: z.string().optional(),
  projectPath: z.string().optional(),
  kind: OutboundKind,
  providerId: z.string(),
  providerLabel: z.string(),
  host: z.string(),
  model: z.string(),
  task: z.string(),
  stage: z.string().optional(),
  itemId: z.string().optional(),
  review: ReviewPolicy,
  excerpts: z.array(OutboundExcerpt),
  parts: z.array(z.object({ name: z.string(), chars: z.number().int(), text: z.string() })),
  redactions: z.partialRecord(RedactionCategory, z.number().int()),
  spans: z.array(RedactionSpan),
  totalChars: z.number().int(),
  estimatedTokens: z.number().int(),
  /** False for embeddings and media: those are previewed but never redacted. */
  redactable: z.boolean(),
  createdAt: IsoDateTime,
})
export type OutboundManifest = z.infer<typeof OutboundManifest>

export const ApprovalKind = z.enum(['asked', 'job-approval', 'document-approval', 'policy-off'])
export type ApprovalKind = z.infer<typeof ApprovalKind>

/** One line of <project>/cloud-sends.jsonl. Sizes and section headings only, never text. */
export const CloudSendEntry = z.object({
  at: IsoDateTime,
  providerId: z.string(),
  providerLabel: z.string(),
  host: z.string(),
  model: z.string(),
  kind: OutboundKind.default('chat'),
  task: z.string(),
  stage: z.string().optional(),
  itemId: z.string().optional(),
  jobId: z.string().optional(),
  excerpts: z.array(z.object({ documentId: Id, headingPath: z.string() })),
  chars: z.record(z.string(), z.number().int()),
  redactions: z.partialRecord(RedactionCategory, z.number().int()),
  approval: ApprovalKind,
  requestHash: z.string(),
})
export type CloudSendEntry = z.infer<typeof CloudSendEntry>

/** Where a provider runs, for the per-provider "On my network, treat as local" option (FR-1). */
export const ProviderNetwork = z.enum(['local', 'remote'])
export type ProviderNetwork = z.infer<typeof ProviderNetwork>
