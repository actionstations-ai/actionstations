// Corrective actions beside the coverage story (FR-6): counts by status, the ageing bars, the
// overdue list and open actions by organization. Owner names show only when the data carries them.
import { Link } from 'react-router'
import { CORRECTIVE_ACTION_STATUSES, CORRECTIVE_ACTION_STATUS_LABELS } from '@shared/schemas'
import type { ProgramHealth } from '@shared/schemas'
import { DataTable } from './DataTable'
import { Bars } from './svg/Bars'

export function ActionsPanel({ health }: { health: ProgramHealth }) {
  const a = health.actions
  return (
    <section aria-labelledby="health-actions" className="card stack">
      <h2 id="health-actions">Corrective actions</h2>
      <p>
        {CORRECTIVE_ACTION_STATUSES.map(
          (s) => `${CORRECTIVE_ACTION_STATUS_LABELS[s]} ${a.byStatus[s]}`,
        ).join(' · ')}
        {' · '}Verified in this cycle {a.verifiedInCycle}.{' '}
        <Link to="/program/actions">Open the corrective actions table</Link>
      </p>
      <Bars
        id="health-ageing"
        title="Age of open corrective actions"
        desc="Open and in-progress actions grouped by days since they were created."
        items={[
          { label: 'Under 90 days', value: a.ageing.under90 },
          { label: '90 to 365 days', value: a.ageing.d90to365 },
          { label: 'Over 365 days', value: a.ageing.over365 },
        ]}
      />
      <h3>Overdue</h3>
      <DataTable
        caption="Overdue corrective actions"
        rows={a.overdue}
        rowKey={(o) => o.id}
        empty="No corrective action is overdue."
        columns={[
          {
            key: 'id',
            label: 'Action',
            value: (o) => o.label,
            cell: (o) => `${o.label} ${o.title}`,
          },
          { key: 'due', label: 'Due', value: (o) => o.dueDate },
          { key: 'days', label: 'Days overdue', align: 'end', value: (o) => o.daysOverdue },
          { key: 'org', label: 'Organization', value: (o) => o.organization },
          ...(health.filter.includeOwners
            ? [
                {
                  key: 'owner',
                  label: 'Owner',
                  value: (o: (typeof a.overdue)[number]) => o.owner ?? '',
                },
              ]
            : []),
        ]}
      />
      <h3>Open actions by organization</h3>
      <DataTable
        caption="Open corrective actions by responsible organization"
        rows={a.byOwnerOrg}
        rowKey={(o) => o.organization}
        empty="No open corrective actions."
        columns={[
          { key: 'org', label: 'Organization', value: (o) => o.organization },
          { key: 'open', label: 'Open', align: 'end', value: (o) => o.open },
          { key: 'overdue', label: 'Overdue', align: 'end', value: (o) => o.overdue },
        ]}
      />
    </section>
  )
}
