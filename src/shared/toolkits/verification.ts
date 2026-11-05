// Verification tasks (spec 0458 FR-7): an inject (a photo, a video card, a screenshot, an account,
// a document) with a hidden ground truth and a set of provenance clues the players can request,
// each costing exercise time. Players record a verdict and a confidence; the verification metric
// scores them. Clue data is plain text (and template figures): no real person's image or voice,
// and no working link to a real site. Pure data and functions, no Node imports.
import { z } from 'zod'

export const GROUND_TRUTHS = [
  'authentic',
  'misattributed',
  'manipulated',
  'synthetic',
  'satire',
  'unverifiable',
] as const
export type GroundTruth = (typeof GROUND_TRUTHS)[number]

/** Truths that make an item false for publication purposes. */
export const FALSE_TRUTHS: readonly GroundTruth[] = ['misattributed', 'manipulated', 'synthetic']

export const VERDICTS = ['Verified', 'False', 'Unverified', 'Hold'] as const
export type Verdict = (typeof VERDICTS)[number]
export const CONFIDENCES = ['Low', 'Medium', 'High'] as const
export type Confidence = (typeof CONFIDENCES)[number]

export const CLUE_KINDS = [
  'reverse_image',
  'metadata',
  'geolocation',
  'account_history',
  'first_appearance',
  'original_source',
  'credential_check',
] as const
export type ClueKind = (typeof CLUE_KINDS)[number]

export const CLUE_LABELS: Record<ClueKind, string> = {
  reverse_image: 'Reverse image result',
  metadata: 'Metadata and file properties',
  geolocation: 'Geolocation clues',
  account_history: 'Account history',
  first_appearance: 'First-appearance timeline',
  original_source: 'Original-source contact',
  credential_check: 'Credential check (Content Credentials)',
}

/** Default exercise minutes each kind of check costs, when a clue does not set its own. */
export const DEFAULT_CLUE_COST_MIN: Record<ClueKind, number> = {
  reverse_image: 5,
  metadata: 3,
  geolocation: 10,
  account_history: 6,
  first_appearance: 8,
  original_source: 15,
  credential_check: 2,
}

export const CREDENTIAL_STATUSES = ['present_valid', 'present_invalid', 'absent'] as const
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number]

/** The wording players see for a Content Credentials check, with the rule shown beside it. */
export const CREDENTIAL_RESULT: Record<CredentialStatus, string> = {
  present_valid:
    'Content Credentials found and valid: the file has not changed since it was signed. This says who signed it, not that the content is true.',
  present_invalid:
    'Content Credentials found but not valid: the file or its signature does not match, so the file may have been altered or the signature is damaged.',
  absent:
    'No Content Credentials found. Absence proves nothing: most authentic files have none, and credentials are often stripped when a file is shared.',
}
export const CREDENTIAL_RULE =
  'A missing credential proves nothing. A valid credential says who signed, not that the content is true.'

const Text = (n: number) => z.string().min(1).max(n)

export const VerificationClue = z.object({
  kind: z.enum(CLUE_KINDS),
  /** Exercise minutes the check takes; the default for its kind when absent. */
  costMin: z.number().int().min(0).max(240).optional(),
  /** What the check found, in plain text. No working links to real sites. */
  text: Text(1000),
})
export type VerificationClue = z.infer<typeof VerificationClue>

export const VerificationTask = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
    title: Text(200),
    subject: z.enum(['photo', 'video', 'screenshot', 'account', 'document']),
    /** What the players see before any check (the inject's own text). */
    description: Text(1000),
    /** Hidden from players until the debrief. */
    groundTruth: z.enum(GROUND_TRUTHS),
    clues: z.array(VerificationClue).max(7),
    /** Result of the credential check; the clue text for it is derived from this. */
    credentialStatus: z.enum(CREDENTIAL_STATUSES).default('absent'),
  })
  .refine((t) => new Set(t.clues.map((c) => c.kind)).size === t.clues.length, {
    message: 'a task has at most one clue of each kind',
    path: ['clues'],
  })
export type VerificationTask = z.infer<typeof VerificationTask>

/** What a player gets back for asking for a check, and what it cost. */
export interface ClueResult {
  kind: ClueKind
  label: string
  costMin: number
  text: string
  /** Shown beside every credential check. */
  rule?: string
}

/**
 * The result of requesting one check. A kind the task authored no clue for returns "no result",
 * which is a result and still costs the time. The credential check always reports the task's
 * credential status with the fixed wording.
 */
export function requestClue(task: VerificationTask, kind: ClueKind): ClueResult {
  const clue = task.clues.find((c) => c.kind === kind)
  const costMin = clue?.costMin ?? DEFAULT_CLUE_COST_MIN[kind]
  if (kind === 'credential_check')
    return {
      kind,
      label: CLUE_LABELS[kind],
      costMin,
      text: CREDENTIAL_RESULT[task.credentialStatus],
      rule: CREDENTIAL_RULE,
    }
  return {
    kind,
    label: CLUE_LABELS[kind],
    costMin,
    text:
      clue?.text ?? 'The check returned nothing useful. A check with no result is still a result.',
  }
}

/**
 * Whether a verdict is the right call for a ground truth. Authentic wants Verified; an item that
 * cannot be verified wants Unverified or Hold; false items (and satire, which must not run as
 * news) want False or Hold.
 */
export function verdictIsCorrect(truth: GroundTruth, verdict: Verdict): boolean {
  switch (truth) {
    case 'authentic':
      return verdict === 'Verified'
    case 'unverifiable':
      return verdict === 'Unverified' || verdict === 'Hold'
    case 'satire':
      return verdict === 'False' || verdict === 'Hold'
    default:
      return verdict === 'False' || verdict === 'Hold'
  }
}

export const isFalseItem = (truth: GroundTruth): boolean => FALSE_TRUTHS.includes(truth)

/** Weight of a confidence for the calibration note: wrong and High is the worst. */
export const CONFIDENCE_WEIGHT: Record<Confidence, number> = { Low: 1, Medium: 2, High: 3 }
