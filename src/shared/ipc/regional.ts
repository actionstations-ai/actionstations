// regional:* (spec 0440). Bundle files are chosen in the renderer (dialog:open-files /
// dialog:save-file) and passed here as paths; main verifies every bundle before using it.
import { z } from 'zod'
import { channel } from './define'
import { RegionalIdentity } from '../schemas/settings'
import {
  BundleKind,
  Fingerprint,
  OrgId,
  OrgPrefix,
  Proposal,
  PublicOrg,
  RegionalState,
} from '../schemas/regional'

const S = z.object({ projectPath: z.string().min(1), scenarioId: z.string().min(1) })

export const PinState = z.enum(['pinned', 'new', 'changed', 'unknown_org', 'no_exercise'])

export const BundleSummary = z.object({
  kind: BundleKind,
  exerciseId: z.string(),
  title: z.string(),
  final: z.boolean(),
  frameVersion: z.number(),
  createdAt: z.string(),
  from: z.object({ orgId: OrgId, name: z.string(), prefix: OrgPrefix, fingerprint: Fingerprint }),
  orgs: z.array(PublicOrg),
  frame: z
    .object({
      objectives: z.number(),
      phases: z.number(),
      roles: z.number(),
      sharedRows: z.number(),
    })
    .optional(),
  slices: z.array(
    z.object({
      orgId: OrgId,
      revision: z.number(),
      rows: z.number(),
      privateRows: z.number(),
      injects: z.number(),
      proposals: z.number(),
    }),
  ),
  mediaFiles: z.number(),
  pin: PinState,
})
export type BundleSummary = z.infer<typeof BundleSummary>

export const ExportReview = z.object({
  kind: BundleKind,
  files: z.array(z.object({ path: z.string(), size: z.number() })),
  totalBytes: z.number(),
  rowFields: z.array(z.string()),
  citingItems: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['row', 'inject']),
      citations: z.number(),
      withQuotes: z.number(),
    }),
  ),
  privateRows: z.array(z.object({ id: z.string(), publicSummary: z.string() })),
  sharesQuotes: z.boolean(),
})
export type ExportReview = z.infer<typeof ExportReview>

export const MergeConflict = z.object({
  code: z.enum(['ownership', 'stale_frame', 'timing', 'dependency', 'revision', 'duplicate']),
  severity: z.enum(['rejected', 'warning']),
  orgId: z.string(),
  rowId: z.string().optional(),
  message: z.string(),
})

export const MergeOrgView = z.object({
  orgId: z.string(),
  revision: z.number(),
  usable: z.boolean(),
  added: z.array(z.string()),
  changed: z.array(
    z.object({
      id: z.string(),
      fields: z.array(z.object({ field: z.string(), before: z.unknown(), after: z.unknown() })),
    }),
  ),
  removed: z.array(z.string()),
  placeholders: z.array(z.string()),
  rejectedRows: z.array(z.string()),
  rejectedInjects: z.array(z.string()),
})

export const MergePreviewView = z.object({
  bundles: z.array(
    z.object({
      path: z.string(),
      orgId: z.string(),
      fingerprint: z.string(),
      pin: PinState,
      revision: z.number(),
    }),
  ),
  orgs: z.array(MergeOrgView),
  conflicts: z.array(MergeConflict),
})
export type MergePreviewView = z.infer<typeof MergePreviewView>

export const regionalChannels = {
  'regional:identities': channel(z.void(), z.array(RegionalIdentity)),
  'regional:identity-create': channel(
    z.object({ name: z.string().min(1).max(120), prefix: OrgPrefix }),
    RegionalIdentity,
  ),
  'regional:create': channel(
    S.extend({
      hostOrg: OrgId,
      orgs: z.array(z.object({ name: z.string().min(1).max(120), prefix: OrgPrefix })).max(8),
    }),
    RegionalState,
  ),
  /** null when the scenario is not part of a regional exercise. */
  'regional:state': channel(S, RegionalState.nullable()),
  'regional:settings': channel(
    S.extend({
      shareQuotes: z.boolean().optional(),
      shareFullLog: z.boolean().optional(),
      crossOrgChannels: RegionalState.shape.crossOrgChannels.optional(),
    }),
    RegionalState,
  ),
  'regional:export-review': channel(S.extend({ kind: BundleKind }), ExportReview),
  /** `path` is the .asexercise file the user chose in the save dialog. */
  'regional:export': channel(
    S.extend({ kind: BundleKind, path: z.string().min(1) }),
    z.object({ path: z.string(), sha256: z.string() }),
  ),
  /** Verifies a bundle and describes it; changes nothing. */
  'regional:inspect': channel(
    z.object({
      path: z.string().min(1),
      projectPath: z.string().optional(),
      scenarioId: z.string().optional(),
    }),
    BundleSummary,
  ),
  'regional:pin': channel(
    S.extend({
      path: z.string().min(1),
      confirmFingerprint: z.string().min(1),
      replace: z.boolean().default(false),
    }),
    RegionalState,
  ),
  'regional:join': channel(
    z.object({
      path: z.string().min(1),
      projectPath: z.string().min(1),
      orgId: OrgId,
      confirmFingerprint: z.string().min(1),
    }),
    z.object({ scenarioId: z.string() }),
  ),
  'regional:merge-preview': channel(
    S.extend({ paths: z.array(z.string()).min(1).max(8) }),
    MergePreviewView,
  ),
  'regional:merge-apply': channel(
    S.extend({
      paths: z.array(z.string()).min(1).max(8),
      accept: z.array(z.object({ orgId: OrgId, revision: z.number().int() })),
    }),
    z.object({ state: RegionalState, conflicts: z.array(MergeConflict) }),
  ),
  'regional:import-merged': channel(
    S.extend({ path: z.string().min(1) }),
    z.object({ state: RegionalState, changes: z.array(z.string()) }),
  ),
  'regional:propose': channel(
    S.extend({
      rowId: z.string(),
      field: Proposal.shape.field,
      suggested: Proposal.shape.suggested,
      reason: z.string().max(500),
    }),
    RegionalState,
  ),
  'regional:proposal-resolve': channel(
    S.extend({ id: z.string(), accept: z.boolean(), note: z.string().max(500).optional() }),
    RegionalState,
  ),
  'regional:finalize': channel(S, RegionalState),
  /** The controller roster for the joint session (FR-19). */
  'regional:roster': channel(
    S,
    z.object({ roster: z.unknown(), missingLiveKey: z.array(z.string()) }),
  ),
  /** Per-organization log slices of a finished session, written as JSON files in `folder`. */
  'regional:log-slices': channel(
    S.extend({ sessionId: z.string(), folder: z.string().min(1) }),
    z.array(z.object({ orgId: z.string(), path: z.string(), entries: z.number() })),
  ),
}
