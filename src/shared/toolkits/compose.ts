// Composition of toolkits (spec 0448 FR-2, FR-3): what a scenario's toolkits add to the
// generator's context, and which toolkits to suggest for a brief. Pure functions over parsed
// toolkits, so main, the renderer and the tests share them.
import type { Toolkit } from './schema'

/** Characters of toolkit knowledge one prompt receives in total (like other context caps). */
export const KNOWLEDGE_TOTAL_CAP = 6000
/** Characters one toolkit may contribute before it is cut. */
export const KNOWLEDGE_PER_TOOLKIT_CAP = 3000

export interface ToolkitKnowledgeText {
  /** The fragments of every toolkit, within the caps; empty when no toolkit has knowledge. */
  text: string
  /** Toolkit ids whose knowledge was cut to fit. */
  truncated: string[]
}

function knowledgeLines(t: Toolkit): string[] {
  const { glossary, productConventions, realismRules } = t.knowledge
  const lines: string[] = []
  if (glossary.length) {
    lines.push('Terms:')
    for (const g of glossary) lines.push(`- ${g.term}: ${g.definition}`)
  }
  if (productConventions.length) {
    lines.push('Product conventions:')
    for (const c of productConventions) lines.push(`- ${c}`)
  }
  if (realismRules.length) {
    lines.push('Realism rules:')
    for (const r of realismRules) lines.push(`- ${r}`)
  }
  return lines
}

/** Take whole lines up to `cap` characters; reports whether anything was left out. */
function takeLines(lines: string[], cap: number): { kept: string[]; cut: boolean } {
  const kept: string[] = []
  let used = 0
  for (const line of lines) {
    if (used + line.length + 1 > cap) return { kept, cut: true }
    kept.push(line)
    used += line.length + 1
  }
  return { kept, cut: false }
}

/**
 * The knowledge of `toolkits` as one prompt block, in the order given. Each toolkit gets at
 * most KNOWLEDGE_PER_TOOLKIT_CAP characters and the block at most `totalCap`; whole lines are
 * kept, so a rule is never cut in the middle.
 */
export function toolkitKnowledge(
  toolkits: readonly Toolkit[],
  totalCap = KNOWLEDGE_TOTAL_CAP,
): ToolkitKnowledgeText {
  const blocks: string[] = []
  const truncated: string[] = []
  let left = totalCap
  for (const t of toolkits) {
    const lines = knowledgeLines(t)
    if (!lines.length) continue
    const head = `${t.name} (${t.id})`
    const { kept, cut } = takeLines(
      lines,
      Math.min(KNOWLEDGE_PER_TOOLKIT_CAP, left - head.length - 1),
    )
    if (!kept.length) {
      truncated.push(t.id)
      continue
    }
    if (cut) truncated.push(t.id)
    const block = [head, ...kept].join('\n')
    blocks.push(block)
    left -= block.length + 2
    if (left <= 0) break
  }
  return { text: blocks.join('\n\n'), truncated }
}

const dedupe = (items: readonly string[]): string[] => {
  const seen = new Set<string>()
  return items.filter((x) => {
    const k = x.toLowerCase()
    return seen.has(k) ? false : (seen.add(k), true)
  })
}

/** The domain's outside parties followed by the toolkits' (no repeats). */
export const mergedOutsideParties = (base: readonly string[], toolkits: readonly Toolkit[]) =>
  dedupe([...base, ...toolkits.flatMap((t) => t.outsideParties)])

/** The inject type ids the toolkits add that the domain does not already list. */
export const toolkitInjectTypeIds = (
  base: readonly string[],
  toolkits: readonly Toolkit[],
): string[] => dedupe(toolkits.flatMap((t) => t.injectTypes)).filter((id) => !base.includes(id))

// ---- suggestions --------------------------------------------------------------------------

export interface ToolkitSuggestion {
  toolkitId: string
  /** One line the user reads before confirming, e.g. `The brief mentions "tornado".` */
  reason: string
}

export interface SuggestInput {
  /** Every toolkit available to the project. */
  available: readonly Toolkit[]
  /** Toolkit ids already on for the scenario. */
  active: readonly string[]
  /** The brief text: the designer's prompt, objectives, constraints and the like. */
  text: string
  domainId: string
  domainLabel?: string
  /** The domain profile's suggestedToolkits. */
  profileSuggested?: readonly string[]
  /** Toolkit ids the user already dismissed for this scenario. */
  dismissed?: readonly string[]
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The first keyword found in `text` as a whole word or phrase (case-insensitive). */
export function firstKeywordIn(text: string, keywords: readonly string[]): string | undefined {
  const lower = text.toLowerCase()
  return keywords.find((k) => {
    const w = k.trim().toLowerCase()
    return w.length > 1 && new RegExp(`(^|[^a-z0-9])${escapeRe(w)}([^a-z0-9]|$)`).test(lower)
  })
}

/**
 * Toolkits to propose for a scenario, with a one-line reason each: those whose hazard words
 * the brief mentions first, then those the domain suggests. Already-on and dismissed ones are
 * left out. The user confirms; nothing is turned on here.
 */
export function suggestToolkits(input: SuggestInput): ToolkitSuggestion[] {
  const skip = new Set([...input.active, ...(input.dismissed ?? [])])
  const byBrief: ToolkitSuggestion[] = []
  const byDomain: ToolkitSuggestion[] = []
  for (const t of input.available) {
    if (skip.has(t.id)) continue
    const word = firstKeywordIn(input.text, t.appliesTo.keywords)
    if (word) {
      byBrief.push({ toolkitId: t.id, reason: `The brief mentions "${word}".` })
    } else if (
      input.profileSuggested?.includes(t.id) ||
      t.appliesTo.domains.includes(input.domainId)
    ) {
      const who = input.domainLabel ? `${input.domainLabel} exercises` : 'this kind of exercise'
      byDomain.push({ toolkitId: t.id, reason: `Suggested for ${who}.` })
    }
  }
  return [...byBrief, ...byDomain]
}
