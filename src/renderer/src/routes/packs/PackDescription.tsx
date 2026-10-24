// A pack's description as text-only Markdown (#268); see description.ts.
import { useMemo } from 'react'
import { descriptionHtml } from './description'

export function PackDescription({ source, label }: { source: string; label: string }) {
  const html = useMemo(() => descriptionHtml(source), [source])
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
