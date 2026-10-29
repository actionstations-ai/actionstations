// Grounding labels for display (#423): words, tones and summaries shared by the badge, the
// details dialog, the MSEL source-check bar and the scenario page. Every label is a word with an
// icon, never colour alone.
import {
  effectiveLabel,
  type GroundingLabel,
  type GroundingResult,
} from '@shared/schemas/grounding'

export type ShownLabel = Exclude<GroundingLabel, 'none'>

export const LABEL_TEXT: Record<ShownLabel, string> = {
  grounded: 'Grounded',
  review: 'Needs review',
  unsupported: 'Unsupported',
}

/** Short words for the MSEL grid's narrow citations column. */
export const LABEL_SHORT: Record<ShownLabel, string> = {
  grounded: 'Grounded',
  review: 'Review',
  unsupported: 'Unsupported',
}

/** The app's status badge tones (contrast-checked in scripts/check-contrast.mjs). */
export const LABEL_TONE: Record<ShownLabel, 'ok' | 'warn' | 'error'> = {
  grounded: 'ok',
  review: 'warn',
  unsupported: 'error',
}

/** Who set the label shown: the user, the model, or the checker. */
export function labelSource(r: GroundingResult): 'you' | 'model' | 'checker' {
  if (r.override) return 'you'
  if (r.model) return 'model'
  return 'checker'
}

export const SOURCE_TEXT = {
  you: 'set by you',
  model: 'checked with the model',
  checker: 'automatic check',
} as const

/** The label shown for a result; undefined when the item makes no plan claim. */
export function shownLabel(r: GroundingResult | undefined): ShownLabel | undefined {
  if (!r) return undefined
  const label = effectiveLabel(r)
  return label === 'none' ? undefined : label
}

/** "Source check: Needs review (automatic check)" for screen readers and tooltips. */
export function accessibleLabel(r: GroundingResult): string {
  const label = shownLabel(r)
  if (!label) return 'Source check: no plan claim'
  return `Source check: ${LABEL_TEXT[label]} (${SOURCE_TEXT[labelSource(r)]})`
}

export interface Counts {
  grounded: number
  review: number
  unsupported: number
}

export function countLabels(
  items: Record<string, GroundingResult> | undefined,
  prefix?: string,
): Counts {
  const c: Counts = { grounded: 0, review: 0, unsupported: 0 }
  for (const [key, r] of Object.entries(items ?? {})) {
    if (prefix && !key.startsWith(prefix)) continue
    const label = shownLabel(r)
    if (label) c[label] += 1
  }
  return c
}

/** "41 grounded · 6 to review · 2 unsupported" (FR-9). */
export function countsLine(c: Counts): string {
  return `${c.grounded} grounded · ${c.review} to review · ${c.unsupported} unsupported`
}

/** Row keys ("row:I-07") of the items to look at, unsupported first, in MSEL order within. */
export function rowsToCheck(
  items: Record<string, GroundingResult> | undefined,
  order: string[],
): { rowId: string; result: GroundingResult; label: ShownLabel }[] {
  const rank = { unsupported: 0, review: 1, grounded: 2 } as const
  return order
    .flatMap((rowId) => {
      const result = items?.[`row:${rowId}`]
      const label = shownLabel(result)
      return result && label && label !== 'grounded' ? [{ rowId, result, label }] : []
    })
    .sort((a, b) => rank[a.label] - rank[b.label])
}
