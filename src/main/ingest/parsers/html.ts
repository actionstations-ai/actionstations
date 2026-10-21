// HTML → sections with a small tag scanner (no DOM in the main process). h1–h6 are headings,
// block tags end paragraphs, tables become pipe tables, list items become "- " lines.
// DOCX goes through mammoth → HTML → here.
import { classifyHeading, cleanHeadingText } from '../headings'
import { OutlineBuilder } from '../outline'
import type { ParsedDocument } from '../types'

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'section',
  'article',
  'header',
  'footer',
  'main',
  'aside',
  'nav',
  'blockquote',
  'pre',
  'ul',
  'ol',
  'li',
  'br',
  'hr',
  'figure',
  'figcaption',
  'dl',
  'dt',
  'dd',
  'address',
])
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?>|([^<]+)/g

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  bull: '•',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
  sect: '§',
  rsaquo: '›',
  lsaquo: '‹',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? m
  })
}

/** Remove script/style/head noise; returns the <title> if present. */
function preclean(html: string): { body: string; title?: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  const body = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head|template|svg|noscript)\b[\s\S]*?<\/\1>/gi, '')
  const cleanTitle = title ? decodeEntities(title).replace(/\s+/g, ' ').trim() : undefined
  return { body, ...(cleanTitle ? { title: cleanTitle } : {}) }
}

class HtmlWalker {
  readonly outline = new OutlineBuilder()
  firstHeading?: { level: number; text: string; used: boolean }
  private inline = ''
  private heading: { level: number; text: string } | undefined
  private table: string[][] | undefined
  private row: string[] | undefined
  private cell: string | undefined
  private listPrefix = false

  text(raw: string): void {
    const t = decodeEntities(raw).replace(/\s+/g, ' ')
    if (this.cell !== undefined) this.cell += t
    else if (this.heading) this.heading.text += t
    else if (!this.table) this.inline += t
  }

  open(tag: string): void {
    if (/^h[1-6]$/.test(tag)) {
      this.flushInline()
      this.heading = { level: Number(tag[1]), text: '' }
    } else if (tag === 'table') {
      this.flushInline()
      this.table = []
    } else if (tag === 'tr' && this.table) this.row = []
    else if ((tag === 'td' || tag === 'th') && this.row) this.cell = ''
    else if (tag === 'li') {
      this.flushInline()
      this.listPrefix = true
    } else if (BLOCK_TAGS.has(tag) && this.cell === undefined) this.flushInline()
    else if (tag === 'br' && this.cell !== undefined) this.cell += ' '
  }

  close(tag: string): void {
    if (/^h[1-6]$/.test(tag) && this.heading) this.closeHeading()
    else if ((tag === 'td' || tag === 'th') && this.row && this.cell !== undefined) {
      this.row.push(this.cell.trim().replace(/\|/g, '\\|'))
      this.cell = undefined
    } else if (tag === 'tr' && this.table && this.row) {
      if (this.row.length) this.table.push(this.row)
      this.row = undefined
    } else if (tag === 'table' && this.table) {
      const rendered = pipeTable(this.table)
      this.table = undefined
      if (rendered) this.outline.paragraph(rendered)
    } else if (BLOCK_TAGS.has(tag) && this.cell === undefined) this.flushInline()
  }

  private closeHeading(): void {
    const { level, text } = this.heading!
    this.heading = undefined
    const clean = cleanHeadingText(text)
    if (!clean) return
    if (!this.firstHeading) {
      this.firstHeading = { level, text: clean, used: false }
      if (level === 1 && classifyHeading(clean).kind === 'plain') {
        this.firstHeading.used = true
        return
      }
    }
    this.outline.heading(level, clean)
  }

  flushInline(): void {
    const t = this.inline.trim()
    if (t) this.outline.paragraph(this.listPrefix ? `- ${t}` : t)
    this.inline = ''
    this.listPrefix = false
  }
}

/** Rows → markdown pipe table; first row is the header. */
export function pipeTable(rows: string[][]): string {
  const width = Math.max(0, ...rows.map((r) => r.length))
  if (!width) return ''
  const pad = (r: string[]) => [...r, ...Array<string>(width - r.length).fill('')]
  const line = (r: string[]) => `| ${pad(r).join(' | ')} |`
  const [head, ...rest] = rows
  return [line(head!), `|${' --- |'.repeat(width)}`, ...rest.map(line)].join('\n')
}

export function parseHtml(html: string, opts: { fallbackTitle: string }): ParsedDocument {
  const { body, title } = preclean(html)
  const walker = new HtmlWalker()
  for (const m of body.matchAll(TAG_RE)) {
    if (m[3] !== undefined) walker.text(m[3])
    else if (m[1]) walker.close(m[2]!.toLowerCase())
    else walker.open(m[2]!.toLowerCase())
  }
  walker.flushInline()
  const fromHeading = walker.firstHeading?.used ? walker.firstHeading.text : undefined
  return {
    title: fromHeading ?? title ?? opts.fallbackTitle,
    pages: 0,
    sections: walker.outline.finish(),
  }
}
