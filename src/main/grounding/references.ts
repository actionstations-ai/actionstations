// Dangling references (#423, FR-11): a passage that points at a plan, annex, appendix or section
// ("see Annex F", "per the Crisis Communications Plan") that matches no ingested document title,
// short name or heading. Pure and deterministic.
import { collapseSpace, phraseKey } from './normalize'

export interface KnownDocument {
  title: string
  shortName?: string
  /** Heading paths of the document's chunks. */
  headings: string[]
}

export interface DanglingReference {
  /** The plan, annex or section the passage names ("Annex F", "Crisis Communications Plan"). */
  target: string
  /** The sentence that names it. */
  span: string
}

const LEAD_WORDS = [
  'see',
  'per',
  'in accordance with',
  'as described in',
  'described in',
  'refer to',
  'under',
  'according to',
  'listed in',
  'set out in',
]
/** "see" or "See": the first letter in either case, the rest as written. */
const LEAD = String.raw`\b(?:${LEAD_WORDS.map((w) => `[${w[0]!.toUpperCase()}${w[0]}]${w.slice(1)}`).join('|')})\s+(?:the\s+)?`
const ANNEX = String.raw`(?:Annex|Appendix|Attachment|Exhibit|Tab)\s+[A-Z0-9]{1,3}(?:[.-]\d+)*\b`
const NAMED = String.raw`(?:[A-Z][\w&'-]*\s+){1,6}(?:Plan|Policy|Procedures|Procedure|Manual|Program|Programme|Protocol|Guide|Playbook|Handbook|Annex)\b`
const REF_RE = new RegExp(`${LEAD}(?<t>${ANNEX}|${NAMED})`, 'g')

function sentenceAround(text: string, at: number): string {
  const start = Math.max(text.lastIndexOf('. ', at) + 2, text.lastIndexOf('\n', at) + 1, 0)
  const rest = text.slice(at)
  const end = /[.;\n](?:\s|$)/.exec(rest)
  return collapseSpace(text.slice(start, at + (end ? end.index + 1 : rest.length)))
}

/** Every phrase that names a document or a part of one, normalized. */
export function knownNames(docs: KnownDocument[]): { names: Set<string>; headings: string[] } {
  const names = new Set<string>()
  const headings: string[] = []
  for (const d of docs) {
    names.add(phraseKey(d.title))
    if (d.shortName) names.add(phraseKey(d.shortName))
    for (const h of d.headings) for (const part of h.split('›')) headings.push(phraseKey(part))
  }
  return { names, headings }
}

/** Whether a reference resolves: a heading starts with it, or a title or short name contains it. */
export function resolves(target: string, known: ReturnType<typeof knownNames>): boolean {
  const t = phraseKey(target.replace(/^the\s+/i, ''))
  if (!t) return true
  if (known.headings.some((h) => h === t || h.startsWith(`${t} `))) return true
  for (const n of known.names) if (n === t || ` ${n} `.includes(` ${t} `)) return true
  // "Crisis Communications Plan" against a title "Public Communications Plan for …": no.
  return false
}

/** References in a passage that match no document, title or heading. */
export function danglingReferences(
  text: string,
  known: ReturnType<typeof knownNames>,
): DanglingReference[] {
  const out: DanglingReference[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(REF_RE)) {
    const target = collapseSpace(m.groups!.t!)
    const key = phraseKey(target)
    if (seen.has(key) || resolves(target, known)) continue
    seen.add(key)
    out.push({ target, span: sentenceAround(text, (m.index ?? 0) + m[0].indexOf(target)) })
  }
  return out
}
