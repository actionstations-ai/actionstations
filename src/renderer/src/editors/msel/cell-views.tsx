// Read-mode renderings for MSEL cells.
import { TriangleAlert } from 'lucide-react'
import type { Citation } from '@shared/schemas/common'
import type { MselRow, Phase } from '@shared/schemas/scenario'
import { citationShort, citationTitle } from './cell-format'
import { phaseWindowWarning } from './model'

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

export function TimeView({ row, phases }: { row: MselRow; phases: Phase[] }) {
  const warn = phaseWindowWarning(row, phases)
  return (
    <>
      <span className="mono">{row.time}</span>
      {row.wallClock && <span className="msel-editor__wall muted">{row.wallClock}</span>}
      {warn && (
        <span className="msel-editor__time-warn" title={warn}>
          <TriangleAlert size={12} aria-hidden />
          <span className="sr-only">{warn}</span>
        </span>
      )}
    </>
  )
}

export function RowId({ row, warnings }: { row: MselRow; warnings: string[] | undefined }) {
  return (
    <>
      <span className="mono msel-editor__id">{row.id}</span>
      {row.injectId && <span className="sr-only"> (has inject)</span>}
      {warnings?.length ? (
        <span className="msel-editor__row-warn" title={warnings.join('\n')}>
          <TriangleAlert size={13} aria-hidden />
          <span className="sr-only">
            {warnings.length} warning{warnings.length > 1 ? 's' : ''}: {warnings.join('; ')}
          </span>
        </span>
      ) : null}
    </>
  )
}
