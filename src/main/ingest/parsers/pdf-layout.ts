// Layout heuristics for PDF text: lines → running-header removal → title → headings → paragraphs.
// Pure functions over extracted lines so they are testable without pdfjs.
import { classifyHeading, isAllCaps, isHeadingShaped, singleNumberLevel } from '../headings'
import { OutlineBuilder } from '../outline'
import type { ParsedDocument } from '../types'

export interface PdfLine {
  page: number
  /** Baseline y in PDF units (origin bottom-left, so it decreases down the page). */
  y: number
  pageHeight: number
  /** Font size in PDF units. */
  size: number
  /** Share of the line's characters set in a bold font (0–1). */
  boldShare: number
  text: string
}

interface HeadingCandidate {
  line: PdfLine
  level?: number
  patterned: boolean
}

const MARGIN_SHARE = 0.08
const PAGE_NUMBER_RE = /^(page\s*)?\d+(\s*(of|\/)\s*\d+)?$/i

const median = (xs: number[]): number => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]!
}

const inMargin = (l: PdfLine): boolean =>
  l.y > l.pageHeight * (1 - MARGIN_SHARE) || l.y < l.pageHeight * MARGIN_SHARE

/** Drop running headers/footers (same text, digits ignored, on ≥ half the pages) and page numbers. */
export function dropRunningLines(lines: PdfLine[], pageCount: number): PdfLine[] {
  const key = (l: PdfLine) => l.text.replace(/\d+/g, '#').toLowerCase().trim()
  const pagesByKey = new Map<string, Set<number>>()
  for (const l of lines.filter(inMargin)) {
    const set = pagesByKey.get(key(l)) ?? new Set<number>()
    set.add(l.page)
    pagesByKey.set(key(l), set)
  }
  const threshold = Math.max(2, Math.ceil(pageCount * 0.5))
  return lines.filter((l) => {
    if (!inMargin(l)) return true
    if (PAGE_NUMBER_RE.test(l.text.trim())) return false
    return pageCount < 2 || (pagesByKey.get(key(l))?.size ?? 0) < threshold
  })
}

/** Character-weighted median font size and whether body text is mostly bold. */
export function bodyStyle(lines: PdfLine[]): { size: number; bold: boolean } {
  const sizes: number[] = []
  let boldChars = 0
  let chars = 0
  for (const l of lines) {
    const n = l.text.length
    for (let i = 0; i < Math.min(n, 200); i += 10) sizes.push(Math.round(l.size * 2) / 2)
    boldChars += n * l.boldShare
    chars += n
  }
  return { size: median(sizes), bold: chars > 0 && boldChars / chars > 0.6 }
}

function candidateFor(
  line: PdfLine,
  body: { size: number; bold: boolean },
): HeadingCandidate | undefined {
  const text = line.text.trim()
  if (!isHeadingShaped(text, 120)) return undefined
  const bigger = line.size >= body.size * 1.12
  const bold = line.boldShare > 0.8 && !body.bold
  const info = classifyHeading(text)
  if (info.level !== undefined) {
    const caps = isAllCaps(text) && info.kind !== 'numbered'
    if (bigger || bold || caps) return { line, level: info.level, patterned: true }
    return undefined
  }
  const words = text.split(/\s+/).length
  const strong = line.size >= body.size * 1.2 && words <= 16
  const boldShort = bold && words <= 12 && text.length <= 90 && /^[A-Z0-9]/.test(text)
  if (!strong && !boldShort) return undefined
  const single = singleNumberLevel(text)
  return single ? { line, level: single, patterned: true } : { line, patterned: false }
}

/** Unnumbered headings take the level of patterned headings set at the same size. */
function assignPlainLevels(candidates: HeadingCandidate[]): void {
  const sizesByLevel = new Map<number, number[]>()
  for (const c of candidates.filter((c) => c.patterned && c.level !== undefined)) {
    const list = sizesByLevel.get(c.level!) ?? []
    list.push(c.line.size)
    sizesByLevel.set(c.level!, list)
  }
  const reference = [...sizesByLevel.values()].map(median)
  const plainSizes = [
    ...new Set(candidates.filter((c) => !c.patterned).map((c) => Math.round(c.line.size))),
  ]
  for (const c of candidates.filter((c) => !c.patterned)) {
    const s = c.line.size
    c.level = reference.length
      ? 1 + reference.filter((r) => r > s + 0.5).length
      : 1 + plainSizes.filter((p) => p > Math.round(s)).length
  }
}

/** Title: the largest text on page 1, before any heading, clearly larger than body text. */
function takeTitle(lines: PdfLine[], body: { size: number }): { title?: string; rest: PdfLine[] } {
  const firstPage = lines.filter((l) => l.page === lines[0]?.page)
  const maxSize = Math.max(0, ...firstPage.map((l) => l.size))
  if (maxSize < body.size * 1.35) return { rest: lines }
  const start = lines.findIndex((l) => Math.abs(l.size - maxSize) < 0.5)
  if (start < 0 || start > 4 || classifyHeading(lines[start]!.text).kind !== 'plain') {
    return { rest: lines }
  }
  let end = start
  while (
    end + 1 < lines.length &&
    lines[end + 1]!.page === lines[start]!.page &&
    Math.abs(lines[end + 1]!.size - maxSize) < 0.5
  )
    end++
  const title = lines
    .slice(start, end + 1)
    .map((l) => l.text.trim())
    .join(' ')
  return { title, rest: [...lines.slice(0, start), ...lines.slice(end + 1)] }
}

const sameStyle = (a: PdfLine, b: PdfLine) =>
  a.page === b.page && Math.abs(a.size - b.size) < 0.5 && Math.abs(a.boldShare - b.boldShare) < 0.3

/** Assemble headings and paragraphs from classified lines. */
export function layoutToDocument(
  allLines: PdfLine[],
  pageCount: number,
  fallbackTitle: string,
): ParsedDocument {
  const lines = dropRunningLines(allLines, pageCount)
  const body = bodyStyle(lines)
  const { title, rest } = takeTitle(lines, body)
  const candidates = rest.map((l) => candidateFor(l, body))
  assignPlainLevels(candidates.filter((c): c is HeadingCandidate => !!c))
  const outline = new OutlineBuilder()
  let para = ''
  let paraPage = 0
  let prev: PdfLine | undefined
  const flush = () => {
    if (para.trim()) outline.paragraph(para.trim(), paraPage)
    para = ''
  }
  for (let i = 0; i < rest.length; i++) {
    const line = rest[i]!
    const cand = candidates[i]
    if (cand) {
      flush()
      let text = line.text.trim()
      // Wrapped heading: following lines in the same style that don't start a new numbered heading.
      while (
        i + 1 < rest.length &&
        candidates[i + 1] &&
        !candidates[i + 1]!.patterned &&
        sameStyle(line, rest[i + 1]!) &&
        line.y - rest[i + 1]!.y <= line.size * 1.6
      ) {
        i++
        text += ' ' + rest[i]!.text.trim()
      }
      outline.heading(cand.level ?? 2, text)
      prev = rest[i]
      continue
    }
    const gap = prev && prev.page === line.page ? prev.y - line.y : Infinity
    const newPara =
      !para ||
      line.page !== paraPage ||
      gap > Math.max(line.size, prev?.size ?? 0) * 1.45 ||
      gap < 0
    if (newPara) {
      flush()
      para = line.text.trim()
      paraPage = line.page
    } else if (para.endsWith('-') && /^[a-z]/.test(line.text.trim())) {
      para = para.slice(0, -1) + line.text.trim()
    } else {
      para += ' ' + line.text.trim()
    }
    prev = line
  }
  flush()
  return { title: title ?? fallbackTitle, pages: pageCount, sections: outline.finish() }
}
