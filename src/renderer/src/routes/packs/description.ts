// A pack's description: Markdown rendered as text only (#268, ADR-0018). Raw HTML shows as
// text; images become their alt text and links become their text plus the address, so a pack
// cannot load anything over the network or navigate the window. DOMPurify keeps only plain
// text-formatting tags as a second layer.
import DOMPurify from 'dompurify'
import { Marked } from 'marked'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const markdown = new Marked({
  gfm: true,
  renderer: {
    html: ({ text }) => escapeHtml(text),
    image: ({ text }) => escapeHtml(text),
    // A description sits under the pack's h2: its "# Title" becomes an h3.
    heading({ tokens, depth }) {
      const level = Math.min(6, depth + 2)
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

/** Sanitized HTML for a pack description (exported for tests). */
export function descriptionHtml(source: string): string {
  const raw = markdown.parse(source, { async: false })
  return DOMPurify.sanitize(raw, { ALLOWED_TAGS, ALLOWED_ATTR: [] })
}
