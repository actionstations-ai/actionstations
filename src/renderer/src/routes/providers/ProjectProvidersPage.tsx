// Project Providers page: per-task overrides of the global routing, stored in project.json.
import { Link, useParams } from 'react-router'
import { PageHeader } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { RoutingTable } from './RoutingTable'
import { useSaveRouting } from './use-save-routing'
import './providers.css'
import { errorText } from '../../lib/errors'

export default function ProjectProvidersPage() {
  const projectPath = fromProjectKey(useParams().projectKey ?? '')
  const providers = useIpcQuery('providers:list', undefined)
  const routing = useIpcQuery('routing:get', { projectPath })
  const { save, saving } = useSaveRouting('project', projectPath)
  const error = providers.error ?? routing.error
  return (
    <div className="page page--wide">
      <PageHeader
        eyebrow="Project"
        title="Provider routing"
        description="Override the app-wide routing for this project only. Rows left on inherit follow the global setting."
      />
      <section className="card stack" aria-labelledby="project-routing-heading">
        <div>
          <h2 id="project-routing-heading">Routing for this project</h2>
          <p className="muted">
            Add or edit providers in <Link to="/providers">Providers</Link>. Overrides are saved in
            the project file, so they travel with the project.
          </p>
        </div>
        {error && (
          <p className="field__error" role="alert">
            {errorText(error)}
          </p>
        )}
        {providers.data && routing.data && (
          <RoutingTable
            key={JSON.stringify(routing.data)}
            scope="project"
            providers={providers.data}
            view={routing.data}
            saving={saving}
            onSave={save}
          />
        )}
      </section>
    </div>
  )
}
