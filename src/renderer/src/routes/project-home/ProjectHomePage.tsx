import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import type { Project } from '@shared/schemas'
import { Badge, Button, EmptyState, PageHeader } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { revealFolder, revealLabel } from '../projects/reveal'
import { ProjectSettingsForm } from './ProjectSettingsForm'
import { GlossaryButton } from '../../components/Glossary'
import { ProjectScenarios } from './ProjectScenarios'
import { ReadinessChecklist } from './ReadinessChecklist'
import './project-home.css'
import { errorText } from '../../lib/errors'

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function ProjectSummary({ path, project }: { path: string; project: Project }) {
  return (
    <dl className="project-summary__meta">
      <dt>Folder</dt>
      <dd className="mono" title={path}>
        {path}
      </dd>
      <dt>Created</dt>
      <dd>{formatDate(project.createdAt)}</dd>
      <dt>Last saved</dt>
      <dd>{formatDate(project.updatedAt)}</dd>
      <dt>Default roles</dt>
      <dd>{project.defaultRoles.length}</dd>
    </dl>
  )
}

const SETTINGS_OPEN_KEY = 'ttx.overview.settingsOpen'

function readOpen(): boolean {
  try {
    return localStorage.getItem(SETTINGS_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

/** Project settings, collapsed under the checklist; the open state is remembered. */
function SettingsDisclosure({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(readOpen)
  return (
    <details
      className="project-settings-details"
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open
        setOpen(next)
        try {
          localStorage.setItem(SETTINGS_OPEN_KEY, next ? '1' : '0')
        } catch {
          // Storage unavailable: the section simply starts collapsed next time.
        }
      }}
    >
      <summary className="project-settings-details__summary">
        <span className="project-settings-details__label">Project settings</span>
        <span className="muted"> Organization, domain, brand and default roles</span>
      </summary>
      <div className="stack project-settings-details__body">{children}</div>
    </details>
  )
}

export default function ProjectHomePage() {
  const { projectKey = '' } = useParams()
  const path = fromProjectKey(projectKey)
  const query = useIpcQuery('project:get', { path })

  if (query.isError)
    return (
      <div className="page">
        <EmptyState
          title="This project could not be opened"
          body={errorText(query.error)}
          actions={
            <Link className="btn btn--primary" to="/projects">
              Back to Projects
            </Link>
          }
        />
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
        description="Work through the steps below to turn your documents into a ready-to-run exercise."
        actions={
          <>
            <GlossaryButton />
            <Button onClick={() => void revealFolder(query.data.path)}>{revealLabel()}</Button>
          </>
        }
      />
      <ReadinessChecklist path={query.data.path} project={project} />
      <ProjectScenarios path={query.data.path} scenarios={project.scenarios} />
      <SettingsDisclosure>
        <ProjectSummary path={query.data.path} project={project} />
        <ProjectSettingsForm key={project.id} path={query.data.path} project={project} />
      </SettingsDisclosure>
    </div>
  )
}
