import { Button, EmptyState, PageHeader } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'

export default function ProjectsPage() {
  const recent = useIpcQuery('project:list-recent', undefined)
  const projects = recent.data ?? []
  return (
    <div className="page">
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        description="A project holds one organization's plans and the exercises built from them. Projects are folders on disk you can copy, back up, or put under version control."
        actions={
          <>
            <Button disabled={recent.isError}>Open folder…</Button>
            <Button variant="primary" disabled={recent.isError}>
              New project
            </Button>
          </>
        }
      />
      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          body="Create a project, then import the plans, policies, maps and forms your exercises should cite — for example an Airport Emergency Plan and a Terminal Incident Response Plan."
        />
      ) : (
        <ul className="grid-cards" aria-label="Recent projects">
          {projects.map((p) => (
            <li key={p.path} className="card">
              <strong>{p.name}</strong>
              <p className="muted">{p.orgName}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
