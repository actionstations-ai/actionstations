// Plain text → sections. Headings are standalone lines that match a numbering pattern
// ("SECTION 13: …", "13.6 …", "APPENDIX 6 …") or are short ALL CAPS lines.
// Also used for OCR output.
import { classifyHeading, isAllCaps, isHeadingShaped, singleNumberLevel } from '../headings'
import { OutlineBuilder } from '../outline'
import type { ParsedDocument } from '../types'

/** Outline level for a plain-text line that looks like a heading, or undefined. */
export function plainTextHeadingLevel(line: string, lastPatternLevel: number): number | undefined {
  const text = line.trim()
  if (!isHeadingShaped(text, 100)) return undefined
  const info = classifyHeading(text)
  if (info.level !== undefined) {
    // "13.6 …" must look like a title, not a numbered sentence.
    if (info.kind === 'numbered' && text.split(/\s+/).length > 14) return undefined
    return info.level
  }
  if (isAllCaps(text)) return singleNumberLevel(text) ?? lastPatternLevel + 1
  return undefined
}

export function parseText(
  source: string,
  opts: { fallbackTitle: string; page?: number },
): ParsedDocument {
  const blocks = source
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
  const outline = new OutlineBuilder()
  let title: string | undefined
  let lastPatternLevel = 1
  blocks.forEach((block, i) => {
    const lines = block.split('\n')
    const first = lines[0]!.trim()
    if (
      i === 0 &&
      lines.length === 1 &&
      isHeadingShaped(first, 120) &&
      classifyHeading(first).kind === 'plain'
    ) {
      title = first
      return
    }
    const level = plainTextHeadingLevel(first, lastPatternLevel)
    if (level !== undefined) {
      outline.heading(level, first)
      if (classifyHeading(first).level !== undefined) lastPatternLevel = level
      lines.shift()
    }
    const body = joinWrappedLines(lines)
    if (body) outline.paragraph(body, opts.page)
  })
  return { title: title ?? opts.fallbackTitle, pages: opts.page ?? 0, sections: outline.finish() }
}

/** Join hard-wrapped lines into one paragraph; keep table / list lines on their own line. */
export function joinWrappedLines(lines: string[]): string {
  let out = ''
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const structured = /^([|*•\-–]|\d+[.)]\s)/.test(line)
    if (!out) out = line
    else if (structured || /^\|/.test(out.split('\n').at(-1) ?? '')) out += '\n' + line
    else if (out.endsWith('-') && /^[a-z]/.test(line)) out = out.slice(0, -1) + line
    else out += ' ' + line
  }
  return out
}
