// Plan sections (FR-5, FR-10): one row per section to depth 3, deduplicated across projects.
// A heading opens the Documents page of a project that cited it, when that project is reachable.
import { useNavigate } from 'react-router'
import type { ProgramHealth, SectionHealth } from '@shared/schemas'
import { Badge } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import type { ProgramContext } from '../ProgramFrame'
import { DataTable, type Column } from './DataTable'
import { projectPathOf, routeInProject } from './open-links'

export function SectionsTable({ health, ctx }: { health: ProgramHealth; ctx: ProgramContext }) {
  const navigate = useNavigate()
  const open = async (projectId: string) => {
    try {
      navigate(await routeInProject(ctx, projectId, 'documents'))
    } catch (e) {
      toast.error('Could not open the documents', e)
    }
  }
  const columns: Column<SectionHealth>[] = [
    {
      key: 'section',
      label: 'Section',
      value: (s) => `${s.documentTitle} ${s.headingPath}`,
      cell: (s) => {
        const from = s.exercises.find((e) => projectPathOf(ctx, e.projectId))
        const text = (
          <>
            <span className="muted">{s.documentTitle}</span>{' '}
            <span style={{ paddingInlineStart: `${(s.depth - 1) * 0.75}rem` }}>
              {s.headingPath.split(' › ').at(-1)}
            </span>
          </>
        )
        return from ? (
          <button type="button" className="program-link" onClick={() => void open(from.projectId)}>
            {text}
          </button>
        ) : (
          text
        )
      },
    },
    { key: 'depth', label: 'Level', align: 'end', value: (s) => s.depth },
    {
      key: 'status',
      label: 'Status',
      value: (s) => (s.never ? 'never' : 'cited'),
      cell: (s) => (
        <Badge tone={s.never ? 'warn' : 'ok'}>{s.never ? 'Never cited' : 'Cited'}</Badge>
      ),
    },
    { key: 'cited', label: 'Times cited', align: 'end', value: (s) => s.timesCited },
    {
      key: 'last',
      label: 'Last cited',
      value: (s) => s.lastCitedAt?.slice(0, 10) ?? '',
      cell: (s) => s.lastCitedAt?.slice(0, 10) ?? '—',
    },
    { key: 'actions', label: 'Open actions', align: 'end', value: (s) => s.openActions },
    {
      key: 'redlines',
      label: 'Redlines',
      align: 'end',
      value: (s) => s.redlines ?? 0,
      cell: (s) => s.redlines ?? '—',
    },
  ]
  return (
    <section aria-labelledby="health-sections" className="card stack">
      <h2 id="health-sections">Plan sections</h2>
      <DataTable
        caption="Plan sections, to three levels, with how often exercises cited them"
        columns={columns}
        rows={health.sections}
        rowKey={(s) => `${s.documentKey}|${s.headingPath}`}
        empty="No plan documents in the linked projects yet."
      />
    </section>
  )
}
