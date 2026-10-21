// Markdown → sections. Uses marked's lexer (block tokens only) for heading structure.
// Also reads our own text.md format: "<!-- page N -->" comments carry page numbers.
import { Lexer, type Token } from 'marked'
import { classifyHeading, cleanHeadingText } from '../headings'
import { OutlineBuilder } from '../outline'
import type { ParsedDocument } from '../types'

const PAGE_MARKER_RE = /^<!--\s*page\s+(\d+)\s*-->$/i

export interface MarkdownOptions {
  /** Used when the document has no title heading. */
  fallbackTitle: string
  /**
   * 'auto': the first heading is the title when it is an H1 without a structural pattern
   * ("PART I" stays a heading). 'always': the first H1 is the title (text.md files).
   */
  titleMode?: 'auto' | 'always'
}

export function parseMarkdown(source: string, opts: MarkdownOptions): ParsedDocument {
  const tokens = Lexer.lex(source.replace(/\r\n?/g, '\n'))
  const outline = new OutlineBuilder()
  const title = takeTitle(tokens, opts)
  let maxPage = 0
  for (const token of tokens) {
    const page = pageMarker(token)
    if (page !== undefined) {
      outline.setPage(page)
      maxPage = Math.max(maxPage, page)
      continue
    }
    if (token.type === 'heading') {
      outline.heading(token.depth as number, cleanHeadingText(token.text as string))
      continue
    }
    const text = blockText(token)
    if (text) outline.paragraph(text)
  }
  return { title: title ?? opts.fallbackTitle, pages: maxPage, sections: outline.finish() }
}

/** Removes the title heading from `tokens` (in place) and returns its text. */
function takeTitle(tokens: Token[], opts: MarkdownOptions): string | undefined {
  const index = tokens.findIndex((t) => t.type === 'heading')
  if (index < 0) return undefined
  const first = tokens[index]!
  if (first.type !== 'heading' || first.depth !== 1) return undefined
  const text = cleanHeadingText(first.text as string)
  if (opts.titleMode !== 'always' && classifyHeading(text).kind !== 'plain') return undefined
  tokens.splice(index, 1)
  return text
}

function pageMarker(token: Token): number | undefined {
  if (token.type !== 'html') return undefined
  const m = PAGE_MARKER_RE.exec((token.raw as string).trim())
  return m ? Number(m[1]) : undefined
}

function blockText(token: Token): string {
  switch (token.type) {
    case 'space':
    case 'hr':
      return ''
    case 'paragraph':
      return (token.raw as string).trim().replace(/\s*\n\s*/g, ' ')
    case 'html':
      return stripHtmlComment((token.raw as string).trim())
    default:
      return (token.raw as string).trim()
  }
}

function stripHtmlComment(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '').trim()
}
