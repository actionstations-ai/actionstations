import type { Citation } from '@shared/schemas/common'

/** Last segment of a heading path ("TIRP › Section 13 › 13.6 …" → "13.6 …"). */
const citationLabel = (c: Citation): string =>
  c.headingPath.split('›').at(-1)?.trim() || c.documentTitle

/** Source sections as compact chips; the full heading path (and quote) shows on hover. */
export function CitationChips({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null
  return (
    <ul className="citations" aria-label="Citations">
      {citations.map((c, i) => {
        const title = [c.headingPath, c.page ? `p. ${c.page}` : '', c.quote ? `“${c.quote}”` : '']
          .filter(Boolean)
          .join('\n')
        return (
          <li key={`${c.documentId}-${i}`} className="citation" title={title}>
            <span className="citation__doc">{c.headingPath.split('›')[0]?.trim()}</span>
            <span className="citation__heading">{citationLabel(c)}</span>
          </li>
        )
      })}
    </ul>
  )
}
