// One item's source check beside its text (#423): the badge, a Details button and the details
// dialog. Used for the inject editor's controller note; reads grounding:scenario, which
// recomputes stale labels, so an edited note is never shown with its old label once saved.
import { useState } from 'react'
import { useIpcQuery } from '../lib/query'
import { GroundingBadge } from './GroundingBadge'
import { GroundingDetails } from './GroundingDetails'
import { Term } from './Glossary'
import { Button } from './ui'

export function SourceCheck(props: {
  projectPath: string
  scenarioId: string
  itemKey: string
  title: string
}) {
  const [open, setOpen] = useState(false)
  const q = useIpcQuery('grounding:scenario', {
    projectPath: props.projectPath,
    scenarioId: props.scenarioId,
  })
  const result = q.data?.items[props.itemKey]
  const labelled = !!result && result.label !== 'none'
  return (
    <div className="source-check__summary" data-testid="source-check">
      <span className="muted">
        <Term id="grounded">Source check</Term>:
      </span>
      {q.isError ? (
        <span className="muted">not available</span>
      ) : !q.data ? (
        <span className="muted">checking…</span>
      ) : labelled ? (
        <GroundingBadge result={result} />
      ) : (
        <span className="muted">no claim about the plans</span>
      )}
      {labelled && (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          Details<span className="sr-only"> of the source check</span>
        </Button>
      )}
      <GroundingDetails
        projectPath={props.projectPath}
        scenarioId={props.scenarioId}
        itemKey={props.itemKey}
        title={props.title}
        result={result}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  )
}
