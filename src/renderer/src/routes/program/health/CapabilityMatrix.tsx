// Core Capabilities by quarter (FR-4, FR-10): every cell carries its count as text and an
// aria-label; a count opens the exercises behind it. Ratings are numbers in their own column, not
// colours, because HSEEP evaluation is not a grade (spec 0438, open question 3).
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { quarterOf } from '@shared/program/health-time'
import { STATUS_LABELS, shortQuarter } from '@shared/program/health-tables'
import type { CapabilityHealth, ProgramHealth } from '@shared/schemas'
import { Badge, Button, Dialog } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import type { ProgramContext } from '../ProgramFrame'
import { DataTable, type Column } from './DataTable'
import { projectPathOf, routeInProject } from './open-links'

const TONE = { never: 'error', stale: 'warn', current: 'ok', planned: 'neutral' } as const
const quarterLabel = (q: string): string => `${q.slice(0, 4)} ${q.slice(5)}`
const resultText = (c: CapabilityHealth): string =>
  c.results ? `${c.results.met}/${c.results.partial}/${c.results.notMet}` : '—'

interface Picked {
  capability: CapabilityHealth
  quarter?: string
}

function ExerciseDialog({
  picked,
  ctx,
  onClose,
}: {
  picked: Picked
  ctx: ProgramContext
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { capability, quarter } = picked
  const rows = capability.exercises.filter(
    (e) => !quarter || (e.exercisedAt && quarterOf(e.exercisedAt) === quarter),
  )
  const open = async (projectId: string, scenarioId: string) => {
    try {
      navigate(await routeInProject(ctx, projectId, `scenarios/${scenarioId}`))
    } catch (e) {
      toast.error('Could not open the scenario', e)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${capability.label}${quarter ? `, ${quarterLabel(quarter)}` : ''}`}
      description={`${rows.length} ${rows.length === 1 ? 'exercise' : 'exercises'}`}
      footer={
        <>
          <Button onClick={() => navigate(`/program/actions?capability=${capability.id}`)}>
            Corrective actions
          </Button>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      {rows.length === 0 ? (
        <p>No exercise was run for this capability in that quarter.</p>
      ) : (
        <ul className="stack">
          {rows.map((e) => {
            const reachable = !!projectPathOf(ctx, e.projectId)
            return (
              <li key={`${e.projectId}|${e.scenarioId}`} className="row health-between">
                <span>
                  {e.title}{' '}
                  <span className="muted">
                    ({e.projectName}, {e.exercisedAt?.slice(0, 10)})
                  </span>
                </span>
                <Button
                  size="sm"
                  disabled={!reachable}
                  onClick={() => void open(e.projectId, e.scenarioId)}
                >
                  {reachable ? 'Open scenario' : 'Not on this computer'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </Dialog>
  )
}

export function CapabilityMatrix({ health, ctx }: { health: ProgramHealth; ctx: ProgramContext }) {
  const [picked, setPicked] = useState<Picked | null>(null)
  const quarterCols: Column<CapabilityHealth>[] = health.cycle.quarters.map((q) => ({
    key: q,
    label: shortQuarter(q),
    align: 'end',
    value: (c) => c.byQuarter[q] ?? 0,
    cell: (c) => {
      const count = c.byQuarter[q] ?? 0
      if (count)
        return (
          <button
            type="button"
            className="program-link health-cell"
            aria-label={`${c.label}, ${quarterLabel(q)}, ${count} ${count === 1 ? 'exercise' : 'exercises'}`}
            onClick={() => setPicked({ capability: c, quarter: q })}
          >
            {count}
          </button>
        )
      if (c.plannedByQuarter[q])
        return (
          <span aria-label={`${c.label}, ${quarterLabel(q)}, planned exercise`}>
            ▢<span className="sr-only"> planned</span>
          </span>
        )
      return <span aria-hidden>·</span>
    },
  }))
  const columns: Column<CapabilityHealth>[] = [
    {
      key: 'capability',
      label: 'Capability',
      value: (c) => c.label,
      cell: (c) => (
        <button type="button" className="program-link" onClick={() => setPicked({ capability: c })}>
          {c.label}
        </button>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      value: (c) => c.status,
      cell: (c) => <Badge tone={TONE[c.status]}>{STATUS_LABELS[c.status]}</Badge>,
    },
    ...quarterCols,
    {
      key: 'last',
      label: 'Last exercised',
      value: (c) => c.lastExercisedAt?.slice(0, 10) ?? '',
      cell: (c) => c.lastExercisedAt?.slice(0, 10) ?? '—',
    },
    {
      key: 'open',
      label: 'Open actions',
      align: 'end',
      value: (c) => c.openActions,
      cell: (c) => `${c.openActions}${c.overdueActions ? ` (${c.overdueActions} overdue)` : ''}`,
    },
    { key: 'results', label: 'Met / partly / not met', value: resultText },
  ]
  return (
    <section aria-labelledby="health-matrix" className="card stack">
      <h2 id="health-matrix">Core Capabilities by quarter</h2>
      <p className="muted">
        ▢ marks a planned exercise. Ratings are counts from observation, not a score.
      </p>
      <DataTable
        caption="Core Capabilities against the quarters of the cycle"
        columns={columns}
        rows={health.capabilities}
        rowKey={(c) => c.id}
        empty="No Core Capabilities match these filters."
      />
      {picked && <ExerciseDialog picked={picked} ctx={ctx} onClose={() => setPicked(null)} />}
    </section>
  )
}
