// Escaping for model-written text in exported documents. Everything a model or user wrote is
// untrusted: it is HTML-escaped before it reaches a PDF, CSS-escaped inside running headers,
// and pipe/newline-escaped inside markdown tables.
import { Marked } from 'marked'

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c)
}

/**
 * A CSS string literal (with quotes) for `content:` in @page margin boxes. Backslashes,
 * quotes and newlines are escaped, and `<` too, so the value can never close the <style>.
 */
export function cssString(value: unknown): string {
  const body = String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\\"<>]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)
  return `"${body}"`
}

/** Only web and mail links survive in exported documents. */
const SAFE_HREF = /^(https?:|mailto:)/i

/** Section markers (`<!-- section:rubric -->`) belong to the document store, not readers. */
export const stripSectionMarkers = (md: string): string => md.replace(/<!--[\s\S]*?-->/g, '')

const markdown = new Marked({
  gfm: true,
  renderer: {
    // Raw HTML in model text is shown as text, never rendered.
    html: ({ text }) => escapeHtml(text),
    link({ href, tokens }) {
      const label = this.parser.parseInline(tokens)
      return SAFE_HREF.test(href) ? `<a href="${escapeHtml(href)}">${label}</a>` : label
    },
    // No remote or local images from model text: the alt text stays.
    image: ({ text }) => escapeHtml(text),
  },
})

/** Model-written markdown → safe HTML (raw HTML escaped, unsafe links and images dropped). */
export function markdownToHtml(md: string): string {
  return markdown.parse(stripSectionMarkers(md), { async: false })
}

/**
 * Markdown for a document body under the export's own title block: the leading run of
 * title headings (`# Handbook` / `## Scenario 3…`) is dropped and the remaining headings are
 * shifted so the shallowest becomes `baseLevel` (keeps the PDF outline h1 → h2 → h3).
 * `keepTitles` keeps that leading run (handouts: every `#` heading is a card of its own).
 */
export function documentBodyHtml(md: string, baseLevel = 2, keepTitles = false): string {
  const tokens = markdown.lexer(stripSectionMarkers(md))
  let i = 0
  while (!keepTitles && i < tokens.length) {
    const t = tokens[i]!
    if (t.type === 'space' || (t.type === 'heading' && t.depth <= 2)) i++
    else break
  }
  const body = tokens.slice(i)
  const depths = body.flatMap((t) => (t.type === 'heading' ? [t.depth as number] : []))
  const shift = depths.length ? baseLevel - Math.min(...depths) : 0
  for (const t of body) {
    if (t.type === 'heading') t.depth = Math.min(6, Math.max(1, t.depth + shift))
  }
  return markdown.parser(Object.assign(body, { links: tokens.links }))
}

/** A closing "*End of Handbook*" line; exports print their own after any appendices. */
const END_NOTE = /(^|\n)[ \t]*[*_]*end of (the )?(handbook|briefing)[^\n]*\s*$/i
export const stripEndNote = (md: string): string => md.replace(END_NOTE, '\n')

/** True when the markdown has a heading matching `pattern` (to avoid duplicate sections). */
export function hasHeading(md: string, pattern: RegExp): boolean {
  return markdown
    .lexer(stripSectionMarkers(md))
    .some((t) => t.type === 'heading' && pattern.test(String(t.text)))
}

/** Inline markdown (no block wrappers) → safe HTML. */
export function inlineMarkdownToHtml(md: string): string {
  return markdown.parseInline(String(md ?? ''), { async: false })
}

/** One cell of a markdown table: pipes escaped, line breaks flattened. */
export function mdCell(value: unknown): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .trim()
}

/** A markdown table from a header row and body rows (all cells escaped). */
export function mdTable(header: string[], rows: unknown[][]): string {
  const line = (cells: unknown[]) => `| ${cells.map(mdCell).join(' | ')} |`
  return [line(header), `|${header.map(() => '---').join('|')}|`, ...rows.map(line)].join('\n')
}
