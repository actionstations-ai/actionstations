// A pack's description: Markdown rendered as text only (#268, ADR-0018). Raw HTML shows as
// text; images become their alt text and links become their text plus the address, so a pack
// cannot load anything over the network or navigate the window. DOMPurify keeps only plain
// text-formatting tags as a second layer.
import DOMPurify from 'dompurify'
import { Marked } from 'marked'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Levels added to a Markdown heading's depth; set per call by descriptionHtml. */
let headingShift = 2

const markdown = new Marked({
  gfm: true,
  renderer: {
    html: ({ text }) => escapeHtml(text),
    image: ({ text }) => escapeHtml(text),
    // A description sits under the pack's h2: its "# Title" becomes an h3.
    heading({ tokens, depth }) {
      const level = Math.max(1, Math.min(6, depth + headingShift))
      return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`
    },
    link({ tokens, href }) {
      const label = this.parser.parseInline(tokens)
      return label === escapeHtml(href) ? label : `${label} (${escapeHtml(href)})`
    },
  },
})

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'del',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
]

/** The shallowest heading depth in the source (1 when it has none). */
function topDepth(source: string): number {
  const depths = markdown
    .lexer(source)
    .flatMap((t) => (t.type === 'heading' ? [(t as { depth: number }).depth] : []))
  return depths.length ? Math.min(...depths) : 1
}

/**
 * Sanitized HTML for a pack description (exported for tests). By default "# Title" becomes an
 * h3; with `topHeading`, the shallowest heading in the text becomes that level instead (release
 * notes that start at "##" under a dialog's h2 get h3, keeping the heading order).
 */
export function descriptionHtml(source: string, topHeading?: number): string {
  headingShift = topHeading ? topHeading - topDepth(source) : 2
  try {
    const raw = markdown.parse(source, { async: false })
    return DOMPurify.sanitize(raw, { ALLOWED_TAGS, ALLOWED_ATTR: [] })
  } finally {
    headingShift = 2
  }
}
