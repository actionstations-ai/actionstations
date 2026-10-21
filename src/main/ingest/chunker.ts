// Section-aware chunker.
// - Token estimate: ceil(words × 1.3) — stable across formats and close to BPE counts for
//   English prose (chars/4 over-counts tables and under-counts short words).
// - Target ~600 tokens with ~80 tokens of overlap between consecutive chunks of one section.
// - A chunk never spans two headings (so never two top-level sections); consecutive runs of the
//   same heading (a section continued on the next page) are packed together, keeping the page
//   where the chunk's own content starts.
// - Split order: paragraph → sentence → words. Tables stay whole when they fit; larger tables
//   split by rows with the header row repeated.
// - Chunk text is the body only; the heading lives in headingPath.
import type { ChunkInput } from '../retrieve/types'
import { buildHeadingPath } from './headings'
import type { ParsedSection } from './types'

export const TOKENS_PER_WORD = 1.3
export const DEFAULT_TARGET_TOKENS = 600
export const DEFAULT_OVERLAP_TOKENS = 80

export interface ChunkOptions {
  targetTokens?: number
  overlapTokens?: number
}

interface Unit {
  text: string
  tokens: number
  page?: number
  /** Units of one paragraph join with a space, across paragraphs with a blank line. */
  paragraph: number
  table: boolean
  overlap?: boolean
}

export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.ceil(words * TOKENS_PER_WORD)
}

const isTable = (block: string) => block.split('\n').every((l) => l.trim().startsWith('|'))

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…]["'”’)\]]?)\s+(?=["'“‘([]?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function splitWords(text: string, maxTokens: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const per = Math.max(1, Math.floor(maxTokens / TOKENS_PER_WORD))
  const out: string[] = []
  for (let i = 0; i < words.length; i += per) out.push(words.slice(i, i + per).join(' '))
  return out
}

function splitTable(block: string, maxTokens: number): string[] {
  const lines = block.split('\n')
  const hasHeader = lines.length > 1 && /^\|[\s:|-]+\|$/.test(lines[1]!.trim())
  const header = hasHeader ? lines.slice(0, 2) : []
  const rows = hasHeader ? lines.slice(2) : lines
  const headerTokens = estimateTokens(header.join(' '))
  const out: string[] = []
  let current: string[] = []
  let tokens = headerTokens
  for (const row of rows) {
    const t = estimateTokens(row)
    if (current.length && tokens + t > maxTokens) {
      out.push([...header, ...current].join('\n'))
      current = []
      tokens = headerTokens
    }
    current.push(row)
    tokens += t
  }
  if (current.length) out.push([...header, ...current].join('\n'))
  return out
}

/** Break one section run into units no larger than the target. */
function unitsOf(sections: ParsedSection[], target: number): Unit[] {
  const units: Unit[] = []
  let paragraph = 0
  for (const section of sections) {
    for (const block of section.text
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean)) {
      paragraph++
      const table = isTable(block)
      // Prose is broken into sentences (packing still prefers paragraph ends, see packUnits);
      // tables stay whole unless they exceed the target.
      const pieces = table
        ? estimateTokens(block) <= target
          ? [block]
          : splitTable(block, target)
        : splitSentences(block).flatMap((s) =>
            estimateTokens(s) <= target ? [s] : splitWords(s, target),
          )
      for (const text of pieces) {
        units.push({
          text,
          tokens: estimateTokens(text),
          page: section.page,
          paragraph: table ? paragraph++ : paragraph,
          table,
        })
      }
    }
  }
  return units
}

function joinUnits(units: Unit[]): string {
  let out = ''
  units.forEach((u, i) => {
    if (i === 0) out = u.text
    else out += (u.paragraph === units[i - 1]!.paragraph ? ' ' : '\n\n') + u.text
  })
  return out
}

/** Trailing prose of a chunk, up to `budget` tokens, carried into the next chunk. */
function overlapTail(units: Unit[], budget: number): Unit[] {
  if (budget <= 0) return []
  const tail: Unit[] = []
  let tokens = 0
  for (let i = units.length - 1; i >= 0; i--) {
    const u = units[i]!
    if (u.table || u.overlap) break
    if (tokens + u.tokens > budget) {
      if (!tail.length) {
        const words = u.text.split(/\s+/)
        const keep = Math.max(1, Math.floor(budget / TOKENS_PER_WORD))
        const text = words.slice(-keep).join(' ')
        tail.unshift({ ...u, text, tokens: estimateTokens(text), overlap: true })
      }
      break
    }
    tail.unshift({ ...u, overlap: true })
    tokens += u.tokens
  }
  return tail
}

/** Share of the target after which a chunk ends at a paragraph break rather than mid-paragraph. */
const PARAGRAPH_CUT_SHARE = 0.7

function packUnits(units: Unit[], target: number, overlap: number): Unit[][] {
  const paragraphTokens = new Map<number, number>()
  for (const u of units)
    paragraphTokens.set(u.paragraph, (paragraphTokens.get(u.paragraph) ?? 0) + u.tokens)
  const chunks: Unit[][] = []
  let current: Unit[] = []
  let tokens = 0
  for (const unit of units) {
    const hasContent = current.some((u) => !u.overlap)
    const startsParagraph = current.at(-1)?.paragraph !== unit.paragraph
    const paragraphWontFit =
      startsParagraph &&
      tokens >= target * PARAGRAPH_CUT_SHARE &&
      tokens + paragraphTokens.get(unit.paragraph)! > target
    if (hasContent && (tokens + unit.tokens > target || paragraphWontFit)) {
      chunks.push(current)
      current = overlapTail(current, overlap)
      tokens = current.reduce((n, u) => n + u.tokens, 0)
      if (tokens + unit.tokens > target) {
        current = []
        tokens = 0
      }
    }
    current.push(unit)
    tokens += unit.tokens
  }
  if (current.some((u) => !u.overlap)) chunks.push(current)
  return chunks
}

/** Group consecutive sections that share the same heading path. */
function runsOf(sections: ParsedSection[]): ParsedSection[][] {
  const runs: ParsedSection[][] = []
  for (const s of sections) {
    const last = runs.at(-1)
    if (last && last[0]!.headingPath.join('\u0000') === s.headingPath.join('\u0000')) last.push(s)
    else runs.push([s])
  }
  return runs
}

export function chunkSections(
  sections: ParsedSection[],
  shortName: string,
  opts: ChunkOptions = {},
): ChunkInput[] {
  const target = opts.targetTokens ?? DEFAULT_TARGET_TOKENS
  const overlap = Math.min(opts.overlapTokens ?? DEFAULT_OVERLAP_TOKENS, Math.floor(target / 2))
  const chunks: ChunkInput[] = []
  for (const run of runsOf(sections)) {
    const headingPath = buildHeadingPath(shortName, run[0]!.headingPath)
    for (const units of packUnits(unitsOf(run, target), target, overlap)) {
      const text = joinUnits(units)
      const page = units.find((u) => !u.overlap)?.page
      chunks.push({
        headingPath,
        ...(page !== undefined ? { page } : {}),
        ord: chunks.length,
        text,
        tokenCount: estimateTokens(text),
      })
    }
  }
  return chunks
}
