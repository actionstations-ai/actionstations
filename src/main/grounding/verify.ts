// "Verify with model" (#423, FR-7): the routed critique provider judges whether each claim of an
// item follows from its cited passages. Every verdict must carry a quote that is word for word
// in a cited passage (after whitespace normalization); a verdict whose quote is not there is
// discarded and logged, so an instruction hidden in a plan cannot fabricate support. The model
// can lower Grounded to Needs review, or raise a label to Grounded when every claim is supported
// with a validated quote. The checker's own label stays visible beside the model's.
import type {
  GroundingLabel,
  GroundingResult,
  GroundingVerifyOutput,
  ModelGrounding,
  SettableGroundingLabel,
} from '@shared/schemas'
import { splitClaims } from './claims'
import { collapseSpace } from './normalize'
import type { Passage } from './support'

export type Verdict = GroundingVerifyOutput['claims'][number]

/** Undo the prompt's escaping of '&' and '<' (escapeText) before comparing a quote. */
const unescape = (s: string): string => s.replace(/&lt;/g, '<').replace(/&amp;/g, '&')

const MIN_QUOTE = 12

/** FR-7: the quote, whitespace collapsed, is a substring of one of the passages. */
export function quoteInPassages(quote: string, passages: Pick<Passage, 'text'>[]): boolean {
  const q = collapseSpace(unescape(quote)).replace(/^["“']|["”']$/g, '')
  if (q.length < MIN_QUOTE) return false
  return passages.some((p) => collapseSpace(p.text).includes(q))
}

export interface CheckedVerdicts {
  valid: Verdict[]
  discarded: Verdict[]
}

export function checkVerdicts(
  verdicts: Verdict[],
  passages: Pick<Passage, 'text'>[],
): CheckedVerdicts {
  const valid: Verdict[] = []
  const discarded: Verdict[] = []
  for (const v of verdicts) (quoteInPassages(v.quote, passages) ? valid : discarded).push(v)
  return { valid, discarded }
}

const key = (s: string): string => collapseSpace(s).toLowerCase()

/**
 * The model's label from its validated verdicts, given the checker's label:
 * - every claim supported with a validated quote → grounded (the only way up);
 * - any validated partial, unsupported or contradicted verdict → a grounded label drops to
 *   review; review and unsupported stay;
 * - nothing validated → the checker's label (the model said nothing that counts).
 */
export function modelLabel(
  base: GroundingLabel,
  claimText: string,
  valid: Verdict[],
): SettableGroundingLabel {
  const fallback: SettableGroundingLabel = base === 'none' ? 'review' : base
  if (!valid.length) return fallback
  const claims = splitClaims(claimText).map(key)
  const verdictOf = new Map(valid.map((v) => [key(v.claim), v.verdict]))
  const all = claims.length ? claims.map((c) => verdictOf.get(c)) : valid.map((v) => v.verdict)
  if (all.every((v) => v === 'supported')) return 'grounded'
  if (all.some((v) => v && v !== 'supported')) return base === 'grounded' ? 'review' : fallback
  return fallback
}

/** The model block stored on a result. */
export function modelGrounding(
  result: GroundingResult,
  claimText: string,
  checked: CheckedVerdicts,
  provider: { providerId: string; model: string },
  at: string,
): ModelGrounding {
  return {
    label: modelLabel(result.label, claimText, checked.valid),
    at,
    providerId: provider.providerId,
    model: provider.model,
    quotes: checked.valid.map((v) => ({ claim: v.claim, quote: v.quote })),
    discarded: checked.discarded.length,
  }
}
