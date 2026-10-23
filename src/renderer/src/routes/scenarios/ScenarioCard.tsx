import { Copy, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import type { ScenarioMeta } from '@shared/schemas/project'
import { Badge, Button } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { projectKey } from '../../state/project'
import { STATUS_LABEL, STATUS_TONE } from './readiness'
import { useReadiness } from './use-readiness'

const formatUpdated = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function ScenarioCard(props: {
  projectPath: string
  meta: ScenarioMeta
  onDuplicate: (meta: ScenarioMeta) => void
  onDelete: (meta: ScenarioMeta) => void
}) {
  const { meta, projectPath } = props
  const detail = useIpcQuery('scenarios:get', { projectPath, scenarioId: meta.id })
  const s = detail.data
  const { readiness } = useReadiness(projectPath, s)
  const status = readiness?.status ?? (meta.status === 'archived' ? 'archived' : 'draft')
  const headingId = `scenario-${meta.id}`
  const injects = s ? s.msel.filter((r) => !['STARTEX', 'ENDEX'].includes(r.purposeTag)).length : 0
  return (
    <li className="card scenario-card" aria-labelledby={headingId}>
      <div className="scenario-card__top">
        <h2 id={headingId}>
          <Link to={`/p/${projectKey(projectPath)}/scenarios/${meta.id}`}>{meta.title}</Link>
        </h2>
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
      </div>
      {s?.subtitle && <p>{s.subtitle}</p>}
      <p className="muted scenario-card__counts">
        {s ? `${s.phases.length} phases · ${injects} injects` : detail.isError ? 'Unreadable' : '…'}
      </p>
      <div className="scenario-card__footer">
        <span className="muted">Updated {formatUpdated(meta.updatedAt)}</span>
        <div className="row">
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Duplicate ${meta.title}`}
            onClick={() => props.onDuplicate(meta)}
          >
            <Copy size={14} aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Delete ${meta.title}`}
            onClick={() => props.onDelete(meta)}
          >
            <Trash2 size={14} aria-hidden />
          </Button>
        </div>
      </div>
    </li>
  )
}
