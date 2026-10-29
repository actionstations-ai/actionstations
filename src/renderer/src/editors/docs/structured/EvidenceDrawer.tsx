// The evidence behind one finding of the AAR/IP (#419): each ref resolved against the
// exercise record (aar:record) to the note, observation, hot wash item, decision, vote,
// message or survey line it points at. The record carries role labels only; nothing here can
// name a participant.
import { X } from 'lucide-react'
import { capabilityName } from '@shared/core-capabilities'
import type { ExerciseRecord } from '@shared/schemas/aar'
import { Badge, Button } from '../../../components/ui'
import type { SelectedFinding } from './CapabilityRatings'
import { resolveEvidence } from './evidence-lines'

export function EvidenceDrawer(props: {
  selected: SelectedFinding
  record: ExerciseRecord | undefined
  loading: boolean
  onClose: () => void
}) {
  const { finding, kind, capability } = props.selected
  return (
    <aside className="aar-evidence" aria-labelledby="aar-evidence-title">
      <header className="part__head">
        <h2 id="aar-evidence-title" className="section-title">
          Evidence
        </h2>
        <Button size="sm" icon variant="ghost" aria-label="Close evidence" onClick={props.onClose}>
          <X size={14} aria-hidden />
        </Button>
      </header>
      <p className="aar-evidence__finding">
        <Badge tone={kind === 'strength' ? 'ok' : 'warn'}>
          {kind === 'strength' ? 'Strength' : 'Area for improvement'}
        </Badge>{' '}
        {finding.title} <span className="muted">· {capabilityName(capability)}</span>
      </p>
      {props.loading && <p className="muted">Loading the exercise record…</p>}
      {props.record && (
        <ul className="aar-evidence__list">
          {finding.evidence.map((ref) => {
            const line = resolveEvidence(props.record!, ref)
            return (
              <li key={ref} className="aar-evidence__item">
                {line ? (
                  <>
                    <span className="aar-evidence__kind">
                      <Badge tone="info">{line.kind}</Badge>
                      {line.meta && <span className="muted mono"> {line.meta}</span>}
                    </span>
                    <span className="aar-evidence__text">{line.text}</span>
                  </>
                ) : (
                  <span className="muted">This item is no longer in the exercise record.</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
