// Grounding support (#434 FR-11 b, FR-13; labels from #423): the share of claim-bearing items
// the app's deterministic source check labels grounded, with unsupported ones counted against.
// The checker's own label is used (model verification off, no overrides in a fresh project).

/** `results`: GroundingResult values; items labelled none make no plan claim and are skipped. */
export function supportScore(results) {
  const counts = { grounded: 0, review: 0, unsupported: 0 }
  for (const r of results) if (r?.label in counts) counts[r.label]++
  const claimBearing = counts.grounded + counts.review + counts.unsupported
  const share = claimBearing ? (counts.grounded - counts.unsupported) / claimBearing : 0
  return { support: Math.max(0, share) * 100, claimBearing, ...counts }
}

/** The MSEL rows' results from grounding:scenario ({ items: { "row:I-07": … } }). */
export const rowResults = (grounding) =>
  Object.entries(grounding?.items ?? {})
    .filter(([key]) => key.startsWith('row:'))
    .map(([, r]) => r)
