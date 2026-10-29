// The totals row and the "Data freshness" line (FR-12) above the panels.
import type { ProgramHealth } from '@shared/schemas'
import { Badge, Button } from '../../../components/ui'

export function TotalsRow({ totals }: { totals: ProgramHealth['totals'] }) {
  const items: [string, number][] = [
    ['Exercises run', totals.exercises],
    ['Capabilities current', totals.capabilitiesCurrent],
    ['Capabilities never exercised', totals.capabilitiesNever],
    ['Plan sections cited', totals.sectionsCited],
    ['Plan sections never cited', totals.sectionsNever],
    ['Open actions', totals.openActions],
    ['Overdue actions', totals.overdueActions],
  ]
  return (
    <dl className="program-counts" aria-label="Totals">
      {items.map(([label, value]) => (
        <div key={label} className="program-count">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function FreshnessLine(props: {
  freshness: ProgramHealth['freshness']
  onRefresh: () => void
  busy: boolean
}) {
  const anyStale = props.freshness.some((f) => f.stale)
  return (
    <div className="row health-fresh">
      <p>
        <strong>Data:</strong>{' '}
        {props.freshness.length === 0
          ? 'no project is linked yet.'
          : props.freshness.map((f, i) => (
              <span key={f.projectId}>
                {i > 0 && ' · '}
                {f.name} ({f.takenAt.slice(0, 10)}
                {!f.reachable && ', not on this computer'}){' '}
                {f.stale && <Badge tone="warn">Out of date</Badge>}
              </span>
            ))}
      </p>
      <Button
        size="sm"
        variant={anyStale ? 'primary' : 'default'}
        disabled={props.busy}
        onClick={props.onRefresh}
      >
        {props.busy ? 'Refreshing…' : 'Refresh from projects'}
      </Button>
    </div>
  )
}
