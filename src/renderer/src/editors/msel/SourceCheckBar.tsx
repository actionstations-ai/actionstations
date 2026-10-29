// Source check above the MSEL grid (#423, FR-9): the label counts, "Verify with model" for the
// whole scenario, and the rows to look at (unsupported first) with Go to row and Details. Stands
// in for a grid filter: the grid keeps every row, so keyboard navigation and drag stay whole.
import { useState } from 'react'
import type { GroundingResult } from '@shared/schemas/grounding'
import { GroundingBadge } from '../../components/GroundingBadge'
import { Term } from '../../components/Glossary'
import { toast } from '../../components/toast-store'
import { Button } from '../../components/ui'
import { call } from '../../lib/api'
import { countLabels, countsLine, rowsToCheck } from '../../lib/grounding'
import { trackJob } from '../../state/jobs'

export function SourceCheckBar(props: {
  projectPath: string
  scenarioId: string
  items: Record<string, GroundingResult> | undefined
  loading: boolean
  rowOrder: string[]
  onJump: (rowId: string) => void
  onDetails: (rowId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const counts = countLabels(props.items, 'row:')
  const toCheck = rowsToCheck(props.items, props.rowOrder)
  const verifyAll = async () => {
    try {
      const req = { projectPath: props.projectPath, scenarioId: props.scenarioId }
      const { jobId } = await call('grounding:verify', req)
      trackJob(jobId, { kind: 'grounding-verify', ...req })
      toast.info('Asking the model about every labelled row', 'Labels update when it finishes.')
    } catch (e) {
      toast.error('Could not start the check', e)
    }
  }
  return (
    <section className="msel-editor__lint source-check" aria-label="Source check">
      <div className="row source-check__summary">
        <span role="status">
          <Term id="grounded">Source check</Term>:{' '}
          {props.loading && !props.items ? 'checking…' : countsLine(counts)}
        </span>
        {toCheck.length > 0 && (
          <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide' : 'Show'} rows to check
          </Button>
        )}
        {counts.grounded + counts.review + counts.unsupported > 0 && (
          <Button size="sm" onClick={() => void verifyAll()}>
            Verify with model
          </Button>
        )}
      </div>
      {open && (
        <ul className="source-check__list" aria-label="Rows to check">
          {toCheck.map(({ rowId, result }) => (
            <li key={rowId} className="source-check__item">
              <GroundingBadge result={result} compact />
              <span className="mono">{rowId}</span>
              <span className="source-check__reason">{result.reason}</span>
              <Button size="sm" variant="ghost" onClick={() => props.onJump(rowId)}>
                Go to row<span className="sr-only"> {rowId}</span>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => props.onDetails(rowId)}>
                Details<span className="sr-only"> for {rowId}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
