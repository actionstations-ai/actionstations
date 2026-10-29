// Grounding and plan-check thresholds (#423). One global set (open question 5); tuned against
// fixtures/calibration.json. A change must keep label.calibration.test.ts green.

/** Checker version: results computed by an older version are recomputed. */
export const GROUNDING_VERSION = 1

/** A claim sentence is supported when this share of its content words is in the best passage. */
export const T_SUPPORT = 0.5
/** Below this share for every claim sentence the item is unsupported. */
export const T_WEAK = 0.2
/** Embedding similarity that supports a claim on its own (skipped with the hash embedder). */
export const S_SUPPORT = 0.78
/** Two plan statements are about the same subject at this token (or embedding) similarity. */
export const S_SUBJECT = 0.5
/** At most this many candidate pairs go to the model per plan check (FR-14). */
export const MAX_PAIRS = 80

/**
 * A passage sentence is "the same statement" as the claim, for a conflicting duration or
 * quantity, when it shares this share (and at least two) of the claim's content words.
 */
export const CONFLICT_CONTEXT = 0.25
