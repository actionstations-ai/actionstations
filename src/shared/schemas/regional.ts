// Regional exercises (spec 0440, ADR-0062): several organizations plan one exercise and exchange
// only exercise material in signed .asexercise bundles. Everything that crosses a bundle is a
// strict schema here, so a field that is not listed cannot travel (the write-side allow-list)
// and an unknown field is refused on import (the read-side allow-list).
import { z } from 'zod'
import { Citation, ExerciseTime, Id, IsoDateTime, SafeId } from './common'
import { MselRow, Phase } from './scenario'
import { Sha256Hex } from './pack'

export const OrgId = z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/)
export const OrgPrefix = z.string().regex(/^[A-Z]{2,6}$/)
/** Organizations per exercise (NFR-4). */
export const MAX_ORGS = 8
export const EXERCISE_FORMAT = 'actionstations-exercise'
export const EXERCISE_FORMAT_VERSION = 1
export const Ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/)
/** 8 groups of 4 lowercase hex characters. */
export const Fingerprint = z.string().regex(/^([0-9a-f]{4} ){7}[0-9a-f]{4}$/)

export const orgIdForPrefix = (prefix: string): string => prefix.toLowerCase()

const Text = (max: number) => z.string().max(max)

export const PublicOrg = z.strictObject({ orgId: OrgId, name: Text(120).min(1), prefix: OrgPrefix })
export type PublicOrg = z.infer<typeof PublicOrg>

export const RegionalOrg = PublicOrg.extend({
  /** Pinned Ed25519 public key (base64 SPKI DER) and its fingerprint. */
  fingerprint: Fingerprint.optional(),
  publicKey: z.string().max(200).optional(),
  /** The organization's live-session key (P-256, base64url), from its last verified bundle. */
  liveKey: z.string().max(200).optional(),
  pinnedAt: IsoDateTime.optional(),
})
export type RegionalOrg = z.infer<typeof RegionalOrg>

export const Proposal = z.strictObject({
  id: SafeId,
  rowId: Text(100),
  field: z.enum(['event', 'expectedAction', 'time', 'toRoleIds', 'from', 'toLabel']),
  suggested: z.union([Text(4000), z.array(Text(100)).max(30)]),
  reason: Text(500),
  fromOrg: OrgId,
  /** The row's owner (who decides). */
  toOrg: OrgId,
  status: z.enum(['open', 'accepted', 'declined']).default('open'),
  note: Text(500).optional(),
})
export type Proposal = z.infer<typeof Proposal>

export const CrossOrgChannel = z.strictObject({
  id: SafeId,
  label: Text(120),
  roleIds: z.array(Text(100)).max(40),
})

const RevisionMap = z.record(z.string(), z.object({ hash: z.string(), revision: z.number().int() }))

/** What this computer remembers about its own rows between exports (FR-8). */
export const LocalRevisions = z.object({
  slice: z.number().int().min(0).default(0),
  rows: RevisionMap.default({}),
  injects: RevisionMap.default({}),
})
export type LocalRevisions = z.infer<typeof LocalRevisions>

export const RegionalState = z.object({
  exerciseId: Ulid,
  role: z.enum(['host', 'participant']),
  thisOrg: OrgId,
  hostOrg: OrgId,
  orgs: z.array(RegionalOrg).min(2).max(MAX_ORGS),
  frameVersion: z.number().int().min(1),
  final: z.boolean().default(false),
  received: z
    .record(
      OrgId,
      z.object({ revision: z.number().int(), sha256: Sha256Hex, receivedAt: IsoDateTime }),
    )
    .default({}),
  merged: z.object({ version: z.string(), at: IsoDateTime }).optional(),
  /** Hash of the frame last exported; the frame version rises when it changes. */
  frameHash: z.string().optional(),
  shareQuotes: z.boolean().default(false),
  shareFullLog: z.boolean().default(false),
  crossOrgChannels: z.array(CrossOrgChannel).default([]),
  proposals: z.array(Proposal).default([]),
  local: LocalRevisions.default({ slice: 0, rows: {}, injects: {} }),
})
export type RegionalState = z.infer<typeof RegionalState>

// --- Bundle ---------------------------------------------------------------------------------

export const BundleKind = z.enum(['frame', 'slice', 'merged'])
export type BundleKind = z.infer<typeof BundleKind>

export const ExerciseBundleManifest = z.strictObject({
  format: z.literal(EXERCISE_FORMAT),
  formatVersion: z.literal(EXERCISE_FORMAT_VERSION),
  kind: BundleKind,
  exerciseId: Ulid,
  title: Text(200),
  from: z.strictObject({
    orgId: OrgId,
    name: Text(120),
    prefix: OrgPrefix,
    fingerprint: Fingerprint,
    /** P-256 live-session key (base64url, 65 bytes); lets the host build the controller roster. */
    liveKey: Text(200).optional(),
  }),
  frameVersion: z.number().int().min(1),
  sliceRevisions: z.record(OrgId, z.number().int().min(0)).default({}),
  final: z.boolean().default(false),
  createdAt: IsoDateTime,
  minAppVersion: Text(40),
  files: z
    .array(z.strictObject({ path: Text(240), sha256: Sha256Hex, size: z.number().int().min(0) }))
    .max(5000),
})
export type ExerciseBundleManifest = z.infer<typeof ExerciseBundleManifest>

export const BundleSignature = z.strictObject({
  alg: z.literal('ed25519'),
  /** base64 SPKI DER. */
  publicKey: Text(200),
  signature: Text(200),
})
export type BundleSignature = z.infer<typeof BundleSignature>

export const SharedCitation = z.strictObject({
  documentId: Id,
  documentTitle: Citation.shape.documentTitle,
  headingPath: Citation.shape.headingPath,
  page: Citation.shape.page,
  quote: Citation.shape.quote,
})
export type SharedCitation = z.infer<typeof SharedCitation>

export const SharedRole = z.strictObject({
  id: Id,
  name: Text(200).min(1),
  abbreviation: Text(40).default(''),
  team: Text(120).default(''),
  description: Text(2000).default(''),
  standingOrders: z.array(Text(1000)).max(30).default([]),
  owner: OrgId,
})
export type SharedRole = z.infer<typeof SharedRole>

/** The fields of an MSEL row that may leave an organization (FR-9). */
export const SharedRow = z.strictObject({
  id: Text(100).min(1),
  phaseId: Id,
  time: ExerciseTime,
  wallClock: MselRow.shape.wallClock,
  from: Text(200),
  toRoleIds: z.array(Text(100)).max(40).default([]),
  toLabel: Text(200).optional(),
  event: Text(8000),
  expectedAction: Text(8000),
  purposeTag: MselRow.shape.purposeTag,
  format: Text(80).optional(),
  injectId: Id.optional(),
  citations: z.array(SharedCitation).max(30).default([]),
  owner: OrgId,
  revision: z.number().int().min(1),
  visibility: z.enum(['exercise', 'owner_controllers']).default('exercise'),
  publicSummary: Text(200).optional(),
  dependsOn: z.array(Text(100)).max(20).optional(),
})
export type SharedRow = z.infer<typeof SharedRow>

export const SharedAsset = z.strictObject({
  id: Id,
  kind: z.string().max(20),
  /** Path inside the bundle: media/<PREFIX>/<injectId>/<assetId>.<ext>. */
  path: Text(240),
  role: z.enum(['rendered', 'generated', 'composite', 'source']).default('rendered'),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  durationSec: z.number().optional(),
})
export type SharedAsset = z.infer<typeof SharedAsset>

/** The fields of an inject that may leave an organization: no versions, translations or prompts. */
export const SharedInject = z.strictObject({
  id: Id,
  mselRowId: Text(100),
  type: Text(80),
  title: Text(300),
  deliveryMode: z.enum(['hand_to_role', 'display_main_screen', 'play_audio', 'read_aloud']),
  fields: z.record(z.string(), z.unknown()).default({}),
  variant: Text(80).optional(),
  instructorNote: Text(8000).optional(),
  citations: z.array(SharedCitation).max(30).default([]),
  assets: z.array(SharedAsset).max(20).default([]),
  includeInDeck: z.boolean().default(true),
  owner: OrgId,
  revision: z.number().int().min(1),
})
export type SharedInject = z.infer<typeof SharedInject>

export const SharedObjective = z.strictObject({
  id: Id,
  name: Text(200).default(''),
  text: Text(2000),
  owner: OrgId.optional(),
})

export const Frame = z.strictObject({
  title: Text(200),
  hostOrg: OrgId,
  orgs: z.array(PublicOrg).min(2).max(MAX_ORGS),
  overview: z.strictObject({
    theme: Text(2000),
    threat: Text(4000),
    operationalImpact: Text(4000),
  }),
  objectives: z.array(SharedObjective).max(60),
  phases: z.array(Phase.strict()).max(12),
  roles: z.array(SharedRole).max(200),
  sharedRows: z.array(SharedRow).max(200),
  crossOrgChannels: z.array(CrossOrgChannel).max(40).default([]),
  shareFullLog: z.boolean().default(false),
})
export type Frame = z.infer<typeof Frame>

export const Slice = z.strictObject({
  orgId: OrgId,
  revision: z.number().int().min(1),
  frameVersion: z.number().int().min(1),
  roles: z.array(SharedRole).max(100),
  rows: z.array(SharedRow).max(1000),
  injects: z.array(SharedInject).max(1000),
  proposals: z.array(Proposal).max(200).default([]),
})
export type Slice = z.infer<typeof Slice>
