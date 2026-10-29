// Grounding labels (#423): whether a generated item's plan claims are supported by the plan
// passages it cites. Worked out by a deterministic check (src/main/grounding); an optional model
// verification and a user override can sit beside it. Results live at scenario level (keyed by
// item), never on MselRow / Inject, so an older build that strips unknown row keys loses nothing.
import { z } from 'zod'
import { IsoDateTime } from './common'

export const GroundingLabel = z.enum(['grounded', 'review', 'unsupported', 'none'])
export type GroundingLabel = z.infer<typeof GroundingLabel>

/** Labels a user or a model can set (none is only ever computed). */
export const SettableGroundingLabel = z.enum(['grounded', 'review', 'unsupported'])
export type SettableGroundingLabel = z.infer<typeof SettableGroundingLabel>

export const ClaimEvidence = z.object({
  /** The claim sentence. */
  text: z.string(),
  /** Best supporting chunk. */
  chunkId: z.number().int().optional(),
  /** Heading path of that chunk, for the popover. */
  headingPath: z.string().optional(),
  overlap: z.number().min(0).max(1),
  similarity: z.number().min(-1).max(1).optional(),
  matched: z.array(z.string()).default([]),
  missing: z.array(z.string()).default([]),
  conflicting: z.array(z.object({ term: z.string(), passage: z.string() })).default([]),
})
export type ClaimEvidence = z.infer<typeof ClaimEvidence>

export const ModelGrounding = z.object({
  label: SettableGroundingLabel,
  at: IsoDateTime,
  providerId: z.string(),
  model: z.string(),
  quotes: z.array(z.object({ claim: z.string(), quote: z.string() })).default([]),
  /** Verdicts thrown away because their quote was not in the cited passage. */
  discarded: z.number().int().nonnegative().default(0),
})
export type ModelGrounding = z.infer<typeof ModelGrounding>

export const GroundingOverride = z.object({
  label: SettableGroundingLabel,
  note: z.string().max(1000).optional(),
  at: IsoDateTime,
})
export type GroundingOverride = z.infer<typeof GroundingOverride>

export const GroundingResult = z.object({
  label: GroundingLabel,
  /** One plain sentence; rendered as text, never HTML. */
  reason: z.string(),
  /** Claim text + citation chunk ids + checker version: a change makes the result stale. */
  fingerprint: z.string(),
  claims: z.array(ClaimEvidence).default([]),
  /** Model verification (FR-7), when run. */
  model: ModelGrounding.optional(),
  /** The user's label (FR-8); sticks until the fingerprint changes. */
  override: GroundingOverride.optional(),
  at: IsoDateTime,
  /** Checker version; a bump recomputes. */
  version: z.number().int(),
})
export type GroundingResult = z.infer<typeof GroundingResult>

/** Item keys: "row:I-07", "inject:<id>", "overview:<n>", "idea:<id>". */
export const ScenarioGrounding = z.looseObject({
  items: z.record(z.string(), GroundingResult).default({}),
})
export type ScenarioGrounding = z.infer<typeof ScenarioGrounding>

/** What the user sees: override, else the model's label, else the checker's. */
export function effectiveLabel(r: GroundingResult): GroundingLabel {
  if (r.label === 'none') return 'none'
  return r.override?.label ?? r.model?.label ?? r.label
}

export const groundingKey = {
  row: (rowId: string): string => `row:${rowId}`,
  inject: (injectId: string): string => `inject:${injectId}`,
  overview: (index: number): string => `overview:${index}`,
  idea: (ideaId: string): string => `idea:${ideaId}`,
}

/** Lint codes grounding adds to the checks (FR-9). */
export const GROUNDING_UNSUPPORTED = 'GROUNDING_UNSUPPORTED'
export const GROUNDING_REVIEW = 'GROUNDING_REVIEW'

/** FR-7 model reply: per claim, a verdict and a verbatim quote from the cited passage. */
export const GroundingVerifyOutput = z.object({
  claims: z.array(
    z.object({
      claim: z.string(),
      verdict: z.enum(['supported', 'partial', 'unsupported', 'contradicted']),
      quote: z.string(),
    }),
  ),
})
export type GroundingVerifyOutput = z.infer<typeof GroundingVerifyOutput>

/** FR-10 model reply for one candidate conflict: a verdict and a verbatim quote from each side. */
export const PlanConflictOutput = z.object({
  verdict: z.enum(['contradicts', 'consistent', 'complementary', 'unrelated']),
  quoteA: z.string(),
  quoteB: z.string(),
  explanation: z.string(),
})
export type PlanConflictOutput = z.infer<typeof PlanConflictOutput>
