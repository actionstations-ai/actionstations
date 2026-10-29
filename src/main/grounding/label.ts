// FR-4 label rules (#423): from per-claim scores to Grounded / Needs review / Unsupported, with
// the reason in one plain sentence. Pure and deterministic; thresholds live in constants.ts.
import type { Citation, ClaimEvidence, GroundingLabel } from '@shared/schemas'
import { anchorTerms, splitClaims, type AnchorOptions } from './claims'
import { S_SUPPORT, T_SUPPORT, T_WEAK } from './constants'
import { collapseSpace } from './normalize'
import { scoreClaim, type ClaimScore, type FactKeys, type PreparedPassage } from './support'

export interface LabelInput {
  /** The claim field ("expectedAction", "instructorNote", "whyItTeaches"). */
  claimText: string
  /** Text whose section references must also resolve (an MSEL row's event). */
  referenceText?: string
  citations: Citation[]
  /** The cited passages that still resolve (FR-3.1). */
  passages: PreparedPassage[]
  facts: FactKeys
  /** Embedding similarity of each claim sentence to each chunk, when computed. */
  similarity?: Map<string, Map<number, number>>
  anchorOptions?: AnchorOptions
}

export interface LabelOutput {
  label: GroundingLabel
  reason: string
  claims: ClaimEvidence[]
}

/** "City of … › Section 7 › 7.1 Setpoint Limits" → "7.1 Setpoint Limits". */
export const sectionName = (headingPath: string | undefined): string =>
  headingPath?.split('›').at(-1)?.trim() || 'the cited passage'

const REFERENCED = 'Referenced: '
const quoted = (s: string): string => `‘${collapseSpace(s)}’`
const short = (s: string, n = 60): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

const supported = (c: ClaimEvidence): boolean =>
  c.overlap >= T_SUPPORT || (c.similarity ?? -1) >= S_SUPPORT
const weak = (c: ClaimEvidence): boolean => c.overlap < T_WEAK && (c.similarity ?? -1) < S_SUPPORT

const evidence = ({ anchors: _anchors, ...e }: ClaimScore): ClaimEvidence => e

/** Section references in other fields (the row's event) that the citations must cover. */
function referenceScore(input: LabelInput): ClaimScore | undefined {
  if (!input.referenceText) return undefined
  const refs = anchorTerms(input.referenceText, input.anchorOptions).filter(
    (a) => a.kind === 'section',
  )
  if (!refs.length) return undefined
  const text = refs.map((r) => r.text).join('; ')
  const score = scoreClaim(text, input.passages, input.facts, input.anchorOptions ?? {})
  return { ...score, text: `${REFERENCED}${text}` }
}

function reasonFor(label: GroundingLabel, claims: ClaimEvidence[]): string {
  const conflict = claims.find((c) => c.conflicting.length)
  if (conflict) {
    const k = conflict.conflicting[0]!
    return `${quoted(k.term)} is not in ${sectionName(conflict.headingPath)}; the passage says ${quoted(short(k.passage, 160))}.`
  }
  if (label === 'unsupported')
    return 'None of the claim’s wording appears in the cited passages; check the source or the claim.'
  const missing = claims.find((c) => c.missing.length)
  if (missing) {
    const terms = missing.missing.slice(0, 3).map(quoted).join(', ')
    return `${terms} ${missing.missing.length > 1 ? 'are' : 'is'} not in ${sectionName(missing.headingPath)} or the facility facts.`
  }
  const thin = claims.find((c) => !supported(c) && !c.text.startsWith(REFERENCED))
  if (thin)
    return `Only ${Math.round(thin.overlap * 100)}% of ${quoted(short(thin.text))} is in ${sectionName(thin.headingPath)}.`
  const where = [...new Set(claims.map((c) => sectionName(c.headingPath)))]
    .slice(0, 2)
    .join(' and ')
  return `Every claim matches ${where}.`
}

/** Whether the text makes a claim about the plans at all (has an anchor or a citation). */
export function makesPlanClaim(
  input: Pick<LabelInput, 'claimText' | 'citations' | 'anchorOptions'>,
): boolean {
  if (!splitClaims(input.claimText).length) return false
  if (input.citations.length) return true
  return splitClaims(input.claimText).some((s) =>
    anchorTerms(s, input.anchorOptions).some((a) => a.kind !== 'identifier'),
  )
}

/** FR-4: the label of one item's claims against its resolved citations. */
export function labelClaims(input: LabelInput): LabelOutput {
  if (!makesPlanClaim(input))
    return { label: 'none', reason: 'No claim about the plans to check.', claims: [] }
  if (!input.passages.length) {
    const reason = input.citations.length
      ? 'The cited passage is no longer in the index (the document was removed or imported again).'
      : 'No plan passage is cited for this claim.'
    return { label: 'unsupported', reason, claims: [] }
  }
  const scores = splitClaims(input.claimText).map((sentence) =>
    scoreClaim(sentence, input.passages, input.facts, {
      ...input.anchorOptions,
      ...(input.similarity?.get(sentence) ? { similarity: input.similarity.get(sentence)! } : {}),
    }),
  )
  const main = scores.map(evidence)
  const ref = referenceScore(input)
  const claims = ref ? [...main, evidence(ref)] : main
  const label = decide(main, claims)
  return { label, reason: reasonFor(label, claims), claims }
}

/** `main`: the claim sentences; `all`: with the section references of other fields. */
function decide(main: ClaimEvidence[], all: ClaimEvidence[]): GroundingLabel {
  if (all.some((c) => c.conflicting.length)) return 'unsupported'
  if (main.every(weak)) return 'unsupported'
  if (main.every(supported) && all.every((c) => !c.missing.length)) return 'grounded'
  return 'review'
}
