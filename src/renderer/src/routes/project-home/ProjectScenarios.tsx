// The project's scenarios on the Overview (#226), each with its live readiness.
import { Plus } from 'lucide-react'
import { Link } from 'react-router'
import type { ScenarioMeta } from '@shared/schemas/project'
import { Badge } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { projectKey } from '../../state/project'
import { STATUS_LABEL, STATUS_TONE } from '../scenarios/readiness'
import { useReadiness } from '../scenarios/use-readiness'

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function ScenarioItem({ path, meta }: { path: string; meta: ScenarioMeta }) {
  const detail = useIpcQuery('scenarios:get', { projectPath: path, scenarioId: meta.id })
  const { readiness: r } = useReadiness(path, detail.data)
  const status = r?.status ?? (meta.status === 'archived' ? 'archived' : 'draft')
  const counts = r
    ? `${r.rows} events · ${r.written}/${r.rows} injects · ${r.rendered}/${r.rows} rendered`
    : detail.isError
      ? 'Unreadable'
      : '…'
  return (
    <li className="project-scenarios__item">
      <Link to={`/p/${projectKey(path)}/scenarios/${meta.id}`} className="project-scenarios__title">
        {meta.title}
      </Link>
      <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
      <span className="muted project-scenarios__counts">{counts}</span>
      <span className="muted project-scenarios__date">Updated {formatDate(meta.updatedAt)}</span>
    </li>
  )
}

export function ProjectScenarios({ path, scenarios }: { path: string; scenarios: ScenarioMeta[] }) {
  const sorted = [...scenarios].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return (
    <section className="card project-scenarios" aria-labelledby="project-scenarios-heading">
      <div className="project-scenarios__header">
        <h2 id="project-scenarios-heading">Scenarios</h2>
        <Link className="btn btn--sm" to={`/p/${projectKey(path)}/generate`}>
          <Plus size={14} aria-hidden /> New scenario
        </Link>
      </div>
      {sorted.length ? (
        <ul className="project-scenarios__list">
          {sorted.map((m) => (
            <ScenarioItem key={m.id} path={path} meta={m} />
          ))}
        </ul>
      ) : (
        <p className="muted">
          No scenarios yet. Once your documents are in, generate one from the step above.
        </p>
      )}
    </section>
  )
}
