// Per-claim scoring against the cited passages (#423, FR-3): which anchor terms each passage
// contains, which contradict it (a different duration or quantity in the same statement, a
// different role in the same slot), the share of the claim's content words it contains, and the
// embedding similarity when the caller computed one. Pure and deterministic.
import type { ClaimEvidence } from '@shared/schemas'
import { anchorTerms, splitClaims, type Anchor, type AnchorOptions } from './claims'
import { ACTION_VERBS } from './claims'
import { CONFLICT_CONTEXT } from './constants'
import {
  collapseSpace,
  contentWords,
  digitsForWords,
  normalizeText,
  phraseKey,
  tokens,
} from './normalize'
import { durationMinutes, extractStatements, sameSubject, valuesDiffer } from './slots'
import { S_SUBJECT } from './constants'

/** A cited chunk with its full text (looked up in the index, never the 200-character quote). */
export interface Passage {
  chunkId: number
  documentId: string
  documentTitle: string
  headingPath: string
  page?: number
  text: string
}

/** A passage prepared once for every claim checked against it. */
export interface PreparedPassage {
  passage: Passage
  /** Normalized, singular tokens of heading + text joined by spaces, padded for phrase lookup. */
  key: string
  words: Set<string>
  sentences: string[]
}

export function preparePassage(passage: Passage): PreparedPassage {
  const all = tokens(`${passage.headingPath} ${passage.text}`)
  return {
    passage,
    key: ` ${all.join(' ')} `,
    words: new Set(all),
    sentences: splitClaims(passage.text).flatMap((s) => s.split(/\s*\|\s*/)),
  }
}

/** Facility facts as phrase keys (FR-4: an anchor found in facility-facts.md counts). */
export type FactKeys = Set<string>

const has = (p: PreparedPassage, key: string): boolean => !!key && p.key.includes(` ${key} `)

/** Some trailing part of the name (at least its last two words) is in the passage. */
function hasName(p: PreparedPassage, key: string): boolean {
  const words = key.split(' ')
  const min = Math.min(2, words.length)
  for (let n = words.length; n >= min; n--) if (has(p, words.slice(-n).join(' '))) return true
  return false
}

function durationsIn(text: string): number[] {
  const out: number[] = []
  for (const m of digitsForWords(text).matchAll(
    /\b\d+(?:\.\d+)?[\s-]*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?)\b/gi,
  )) {
    const v = durationMinutes(m[0])
    if (v !== undefined) out.push(v)
  }
  return out
}

function quantitiesIn(text: string, unit: string): number[] {
  const out: number[] = []
  const n = normalizeText(text)
  const re = new RegExp(
    String.raw`(?:^|\s)(\d+(?:\.\d+)?)\s*${unit.replace(/[/%]/g, '\\$&')}(?=\s|$)`,
    'g',
  )
  for (const m of n.matchAll(re)) out.push(Number(m[1]))
  return out
}

/** Whether an anchor is stated by the passage (or, for names and identifiers, by the facts). */
export function anchorFound(a: Anchor, p: PreparedPassage, facts: FactKeys): boolean {
  switch (a.kind) {
    case 'verb':
      return ACTION_VERBS.find((v) => v.id === a.key)!.re.test(p.passage.text)
    case 'section': {
      const k = a.key
      return has(p, k) || p.key.includes(` ${k}.`) || has(p, `section ${k}`)
    }
    case 'duration':
      return durationsIn(p.passage.text).includes(a.value!)
    case 'quantity':
      return quantitiesIn(p.passage.text, a.unit!).includes(a.value!)
    case 'role':
    case 'agency':
      return hasName(p, a.key) || facts.has(a.key)
    case 'identifier':
      return has(p, a.key) || facts.has(a.key)
  }
}

/** The passage sentence that best matches the claim's wording (numbers left out). */
function contextSentence(
  claim: string,
  passages: PreparedPassage[],
  accept: (s: string) => boolean,
): string | undefined {
  const words = new Set(contentWords(claim).filter((w) => !/\d/.test(w)))
  let best: { sentence: string; score: number; shared: number } | undefined
  for (const sentence of passages.flatMap((p) => p.sentences)) {
    if (!accept(sentence)) continue
    const own = new Set(contentWords(sentence))
    let shared = 0
    for (const w of words) if (own.has(w)) shared += 1
    const score = words.size ? shared / words.size : 0
    if (!best || score > best.score) best = { sentence, score, shared }
  }
  return best && best.score >= CONFLICT_CONTEXT && best.shared >= 2 ? best.sentence : undefined
}

const clip = (s: string): string => {
  const c = collapseSpace(s)
  return c.length > 220 ? `${c.slice(0, 217)}…` : c
}

type ValueCheck = { found: true } | { found: false; conflict?: string }

/**
 * A duration or quantity is checked in the passage sentence that states the same thing (the one
 * sharing most of the claim's words among those with a value of that kind): the same value
 * there is support, a different one is a conflict. With no such sentence, the value anywhere in
 * a cited passage counts.
 */
function checkValue(claim: string, a: Anchor, passages: PreparedPassage[]): ValueCheck {
  const values = (x: string): number[] =>
    a.kind === 'duration' ? durationsIn(x) : quantitiesIn(x, a.unit!)
  const context = contextSentence(claim, passages, (x) => values(x).length > 0)
  if (context) {
    if (values(context).includes(a.value!)) return { found: true }
    return { found: false, conflict: clip(context) }
  }
  return passages.some((p) => values(p.passage.text).includes(a.value!))
    ? { found: true }
    : { found: false }
}

/** A different role in the same slot ("approved by …"), from the slot extractors. */
export function slotConflicts(
  claim: string,
  p: PreparedPassage,
): { term: string; passage: string }[] {
  const out: { term: string; passage: string }[] = []
  const mine = extractStatements(claim).filter(
    (m) => m.slot !== 'notify_deadline' && m.slot !== 'report_deadline', // durations: checkValue
  )
  if (!mine.length) return out
  const theirs = extractStatements(p.passage.text)
  for (const m of mine) {
    const same = theirs.filter((t) => sameSubject(m, t, S_SUBJECT))
    const other = same.find((t) => valuesDiffer(m, t))
    if (other && !same.some((t) => !valuesDiffer(m, t)))
      out.push({ term: m.value, passage: clip(other.span) })
  }
  return out
}

/** The claim's content words, without the scenario's own role abbreviations. */
export function claimWords(claim: string, ignore: Iterable<string> = []): string[] {
  const skip = new Set([...ignore].map((s) => s.toLowerCase()))
  return [...new Set(contentWords(claim))].filter((w) => !skip.has(w))
}

/** Share of the words found in any of the passages. */
export function overlap(words: string[], passages: PreparedPassage[]): number {
  if (!words.length) return 0
  return words.filter((w) => passages.some((p) => p.words.has(w))).length / words.length
}

export interface ClaimScore extends ClaimEvidence {
  anchors: Anchor[]
}

/**
 * Score one claim sentence against every passage: the best passage is the one with the
 * highest overlap (similarity breaks ties). Anchors count as found when any cited passage or
 * the facts state them; conflicts are read from the best passage that has one.
 */
export function scoreClaim(
  claim: string,
  passages: PreparedPassage[],
  facts: FactKeys,
  opts: AnchorOptions & { similarity?: Map<number, number> } = {},
): ClaimScore {
  const anchors = anchorTerms(claim, opts)
  const matched: string[] = []
  const missingAnchors: Anchor[] = []
  const conflicting: { term: string; passage: string }[] = []
  for (const a of anchors) {
    if (a.kind === 'duration' || a.kind === 'quantity') {
      const v = checkValue(claim, a, passages)
      if (v.found) matched.push(a.text)
      else missingAnchors.push(a)
      if (!v.found && v.conflict) conflicting.push({ term: a.text, passage: v.conflict })
    } else if (passages.some((p) => anchorFound(a, p, facts))) matched.push(a.text)
    else if (a.kind !== 'verb' && facts.has(phraseKey(a.text))) matched.push(a.text)
    else missingAnchors.push(a)
  }
  conflicting.push(...passages.flatMap((p) => slotConflicts(claim, p)))
  const words = claimWords(claim, opts.ignore)
  let best: { p: PreparedPassage; overlap: number; similarity?: number } | undefined
  for (const p of passages) {
    const o = overlap(words, [p])
    const sim = opts.similarity?.get(p.passage.chunkId)
    const better =
      !best || o > best.overlap || (o === best.overlap && (sim ?? 0) > (best.similarity ?? 0))
    if (better) best = { p, overlap: o, ...(sim !== undefined ? { similarity: sim } : {}) }
  }
  return {
    text: claim,
    ...(best ? { chunkId: best.p.passage.chunkId, headingPath: best.p.passage.headingPath } : {}),
    // Together the cited passages support the claim: the overlap is over all of them.
    overlap: round(overlap(words, passages)),
    ...(best?.similarity !== undefined ? { similarity: round(best.similarity) } : {}),
    matched,
    missing: missingAnchors.map((a) => a.text),
    conflicting: conflicting.slice(0, 3),
    anchors,
  }
}

const round = (n: number): number => Math.round(n * 1000) / 1000
