import DOMPurify from 'dompurify'
import { Marked } from 'marked'
import { useMemo } from 'react'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Raw HTML inside model-written markdown is shown as text, never rendered. DOMPurify is a
// second layer over what marked produces.
const markdown = new Marked({
  gfm: true,
  renderer: { html: ({ text }) => escapeHtml(text) },
})

/** Render model-written markdown read-only and sanitized. */
export function Markdown({ source, label }: { source: string; label: string }) {
  const html = useMemo(() => {
    const raw = markdown.parse(source, { async: false })
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
  }, [source])
  return (
    <article className="markdown" aria-label={label} dangerouslySetInnerHTML={{ __html: html }} />
  )
}
