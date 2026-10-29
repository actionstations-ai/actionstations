// A pack's description as text-only Markdown (#268); see description.ts.
import { useMemo } from 'react'
import { descriptionHtml } from './description'

export function PackDescription({
  source,
  label,
  topHeading,
}: {
  source: string
  label: string
  /** The heading level the text's shallowest heading becomes (default: "#" is an h3). */
  topHeading?: number
}) {
  const html = useMemo(() => descriptionHtml(source, topHeading), [source, topHeading])
  if (!source.trim()) return null
  return (
    <div
      className="markdown pack-description"
      role="region"
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
