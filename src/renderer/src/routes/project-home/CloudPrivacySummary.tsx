// FR-17: when a project routes a text task to a cloud provider, say so on the project page with
// its review policy and redaction state.
import { Link } from 'react-router'
import type { ProviderTask } from '@shared/schemas'
import { isRemoteProvider, providerHost } from '@shared/provider-network'
import { REVIEW_LABEL, redactionSummary } from '../../components/privacy/privacy-model'
import { useIpcQuery } from '../../lib/query'
import { projectKey } from '../../state/project'

const TEXT_TASKS: ProviderTask[] = ['ideate', 'draft', 'critique']

/** Hosts of cloud providers this project's text tasks are routed to. */
function useCloudTextHosts(projectPath: string): string[] {
  const providers = useIpcQuery('providers:list', undefined)
  const routing = useIpcQuery('routing:get', { projectPath })
  const hosts = new Set<string>()
  for (const task of TEXT_TASKS) {
    const ref = routing.data?.effective[task]
    const p = providers.data?.find((x) => x.id === ref?.providerId)
    if (p && isRemoteProvider(p)) hosts.add(providerHost(p) || p.label)
  }
  return [...hosts]
}

export function CloudPrivacySummary(props: { projectPath: string; showLink?: boolean }) {
  const hosts = useCloudTextHosts(props.projectPath)
  const view = useIpcQuery('privacy:get', { projectPath: props.projectPath })
  if (!hosts.length || !view.data) return null
  const s = view.data.effective
  return (
    <section className="card stack" aria-labelledby="cloud-summary-heading">
      <h2 id="cloud-summary-heading">Cloud: sends excerpts to {hosts.join(', ')}</h2>
      <dl className="project-summary__meta">
        <dt>Review</dt>
        <dd>{REVIEW_LABEL[s.review]}</dd>
        <dt>Redaction</dt>
        <dd>{redactionSummary(s)}</dd>
      </dl>
      {props.showLink && (
        <p>
          <Link to={`/p/${projectKey(props.projectPath)}/privacy`}>
            Cloud and privacy settings and send log
          </Link>
        </p>
      )}
    </section>
  )
}
