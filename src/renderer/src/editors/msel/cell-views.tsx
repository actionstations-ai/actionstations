// Read-mode renderings for MSEL cells.
import type { Citation } from '@shared/schemas/common'
import { citationShort, citationTitle } from './cell-format'

export function CompactCitations(props: { citations: Citation[] }) {
  if (!props.citations.length) return <span className="muted">—</span>
  return (
    <ul className="msel-editor__cites" aria-label="Citations">
      {props.citations.map((c, i) => (
        <li key={`${c.documentId}-${i}`} className="msel-editor__cite" title={citationTitle(c)}>
          {citationShort(c)}
        </li>
      ))}
    </ul>
  )
}
