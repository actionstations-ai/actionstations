/**
 * Rule-based detection of promises players make ("we'll notify the FAA by 10:30"), spec 0428
 * FR-15. English only; the phrase lists are data per language so another language can add its
 * own (#435). Matching is token based and capped, so text cannot stall the renderer.
 */
import type { CommitmentSuggestion } from '../ipc/facilitator'

export interface CommitmentLanguage {
  /** Phrases that introduce a promise, lower case, as token lists. */
  phrases: string[][]
  /** Action verbs that make the phrase a commitment. */
  verbs: ReadonlySet<string>
  /** Words that turn the promise into a refusal. */
  negations: ReadonlySet<string>
}

export const ENGLISH: CommitmentLanguage = {
  phrases: [
    ["we'll"],
    ['we', 'will'],
    ["i'll"],
    ['i', 'will'],
    ['going', 'to'],
    ['plan', 'to'],
    ['planning', 'to'],
    ['plans', 'to'],
  ],
  verbs: new Set(
    (
      'notify call brief send issue activate file report escalate evacuate post isolate restore ' +
      'contact update request open close shut block disable reset declare alert inform coordinate ' +
      'deploy dispatch review prepare publish release secure start begin page email text ' +
      'reroute divert switch ask confirm check verify arrange stand'
    ).split(' '),
  ),
  negations: new Set(["won't", 'not', 'never', "don't", "can't", 'cannot', "isn't"]),
}

/** Longest input looked at, in characters. */
export const MAX_SCAN_CHARS = 2000
const MAX_SENTENCE_CHARS = 400
const MAX_SUGGESTIONS = 20
/** Tokens between the promise phrase and its verb ("we will also immediately notify"). */
const VERB_REACH = 3

const tokens = (s: string): string[] => s.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? []

/** Whether a sentence promises an action. */
export function isCommitment(sentence: string, lang: CommitmentLanguage = ENGLISH): boolean {
  const words = tokens(sentence.slice(0, MAX_SENTENCE_CHARS))
  for (let i = 0; i < words.length; i++) {
    for (const phrase of lang.phrases) {
      if (!phrase.every((w, k) => words[i + k] === w)) continue
      const after = words.slice(i + phrase.length, i + phrase.length + VERB_REACH + 1)
      const verbAt = after.findIndex((w) => lang.verbs.has(w))
      if (verbAt < 0) continue
      if (after.slice(0, verbAt).some((w) => lang.negations.has(w))) continue
      return true
    }
  }
  return false
}

const WORDS_TO_N: Record<string, number> = {
  an: 1,
  a: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
}

/** Minutes in "within 20 minutes", "in an hour", "in 2 hours"; undefined when none. */
export function parseRelative(text: string): number | undefined {
  const m =
    /\b(?:within|in|after)\s+(\d{1,3}|an?|one|two|three|four|five)\s+(minutes?|mins?|hours?|hrs?)\b/i.exec(
      text.slice(0, MAX_SENTENCE_CHARS),
    )
  if (!m) return undefined
  const n = WORDS_TO_N[m[1]!.toLowerCase()] ?? Number(m[1])
  return /^h/i.test(m[2]!) ? n * 60 : n
}

/** Minutes after midnight in "by 10:30", "at 1030", "by 0900"; undefined when none. */
export function parseClockTime(text: string): number | undefined {
  const m = /\b(?:by|at|before|until)\s+(\d{1,2}):?([0-5]\d)\b/i.exec(
    text.slice(0, MAX_SENTENCE_CHARS),
  )
  if (!m) return undefined
  const h = Number(m[1])
  return h < 24 ? h * 60 + Number(m[2]) : undefined
}

/** Due time in exercise minutes, from a relative or a wall-clock phrase. */
export function dueMinutes(
  sentence: string,
  nowMin: number,
  startWallMin?: number,
): number | undefined {
  const rel = parseRelative(sentence)
  if (rel !== undefined) return nowMin + rel
  const wall = parseClockTime(sentence)
  if (wall === undefined || startWallMin === undefined) return undefined
  return (((wall - startWallMin) % 1440) + 1440) % 1440
}

/** A short stable id for a suggestion, so a rescan does not add it twice. */
export function suggestionId(source: string, text: string): string {
  let h = 5381
  for (const ch of `${source}\u0000${text}`) h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0
  return `c-${h.toString(36)}`
}

const sentences = (text: string): string[] =>
  text
    .slice(0, MAX_SCAN_CHARS)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)

export interface DetectOptions {
  source: CommitmentSuggestion['source']
  sourceRef?: string
  rowId?: string
  /** Scenario wall-clock start in minutes after midnight, to read "by 10:30". */
  startWallMin?: number
  language?: CommitmentLanguage
}

/** Suggestions for the promises in `text`, written at exercise minute `nowMin`. */
export function detectCommitments(
  text: string,
  nowMin: number,
  opts: DetectOptions = { source: 'note' },
): CommitmentSuggestion[] {
  const out: CommitmentSuggestion[] = []
  for (const sentence of sentences(text)) {
    if (out.length >= MAX_SUGGESTIONS) break
    if (!isCommitment(sentence, opts.language)) continue
    const due = dueMinutes(sentence, nowMin, opts.startWallMin)
    out.push({
      id: suggestionId(opts.sourceRef ?? opts.source, sentence),
      text: sentence.slice(0, 500),
      source: opts.source,
      ...(opts.sourceRef ? { sourceRef: opts.sourceRef } : {}),
      ...(opts.rowId ? { rowId: opts.rowId } : {}),
      ...(due !== undefined ? { dueAtMin: due } : {}),
    })
  }
  return out
}
