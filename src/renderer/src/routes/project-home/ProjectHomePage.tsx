import { useParams } from 'react-router'
import type { Project } from '@shared/schemas'
import { Badge, Button, EmptyState, PageHeader } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { revealFolder, revealLabel } from '../projects/reveal'
import { ProjectSettingsForm } from './ProjectSettingsForm'
import './project-home.css'

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function ProjectSummary({ path, project }: { path: string; project: Project }) {
  const ready = project.documents.filter((d) => d.status === 'ok').length
  return (
    <section className="card project-summary" aria-labelledby="summary-heading">
      <h2 id="summary-heading" className="sr-only">
        Summary
      </h2>
      <dl className="project-summary__stats">
        <div>
          <dt>Documents</dt>
          <dd>{project.documents.length}</dd>
          {project.documents.length > 0 && <span className="muted">{ready} indexed</span>}
        </div>
        <div>
          <dt>Scenarios</dt>
          <dd>{project.scenarios.length}</dd>
        </div>
        <div>
          <dt>Default roles</dt>
          <dd>{project.defaultRoles.length}</dd>
        </div>
      </dl>
      <dl className="project-summary__meta">
        <dt>Folder</dt>
        <dd className="mono" title={path}>
          {path}
        </dd>
        <dt>Created</dt>
        <dd>{formatDate(project.createdAt)}</dd>
        <dt>Last saved</dt>
        <dd>{formatDate(project.updatedAt)}</dd>
      </dl>
    </section>
  )
}

export default function ProjectHomePage() {
  const { projectKey = '' } = useParams()
  const path = fromProjectKey(projectKey)
  const query = useIpcQuery('project:get', { path })

  if (query.isError)
    return (
      <div className="page">
        <EmptyState title="This project could not be opened" body={query.error.message} />
      </div>
    )
  if (!query.data) return <div className="page muted">Loading project…</div>

  const { project } = query.data
  return (
    <div className="page">
      <PageHeader
        eyebrow={project.orgName || 'Project'}
        title={
          <span className="row">
            {project.name}
            {project.archived && <Badge tone="warn">Archived</Badge>}
          </span>
        }
        description="Everything this project generates draws on its organization profile, brand and default roles below."
        actions={
          <Button onClick={() => void revealFolder(query.data.path)}>{revealLabel()}</Button>
        }
      />
      <ProjectSummary path={query.data.path} project={project} />
      <ProjectSettingsForm key={project.id} path={query.data.path} project={project} />
    </div>
  )
}
