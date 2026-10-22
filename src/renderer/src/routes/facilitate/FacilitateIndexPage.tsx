// Nav entry for facilitator mode: pick the scenario to run.
import { Link, useParams } from 'react-router'
import { Presentation } from 'lucide-react'
import { Badge, EmptyState, PageHeader } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey, projectKey } from '../../state/project'
import './facilitate.css'
import { errorText } from '../../lib/errors'

export default function FacilitateIndexPage() {
  const params = useParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const key = projectKey(projectPath)
  const list = useIpcQuery('scenarios:list', { projectPath })
  const scenarios = (list.data ?? []).filter((s) => s.status !== 'archived')
  return (
    <div className="page">
      <PageHeader
        eyebrow="Facilitate"
        title="Run an exercise"
        description="Choose a scenario to open the exercise clock, inject timeline and hot wash notes."
      />
      {list.isError && (
        <p className="field__error" role="alert">
          Could not list scenarios: {errorText(list.error)}
        </p>
      )}
      {list.data && scenarios.length === 0 && (
        <EmptyState
          title="No scenarios yet"
          body="Generate a scenario first; its MSEL becomes the facilitator timeline."
          actions={<Link to={`/p/${key}/scenarios`}>Go to scenarios</Link>}
        />
      )}
      <ul className="fac-picker" aria-label="Scenarios to facilitate">
        {scenarios.map((s) => (
          <li key={s.id} className="card fac-picker__item">
            <Presentation size={18} aria-hidden />
            <Link to={`/p/${key}/scenarios/${s.id}/facilitate`} className="fac-picker__link">
              {s.title}
            </Link>
            <Badge tone={s.status === 'ready' ? 'ok' : 'neutral'}>{s.status}</Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}
