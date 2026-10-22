import { useParams, useSearchParams } from 'react-router'
import { EmptyState, PageHeader } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { PromptEditor } from './PromptEditor'
import { PromptList } from './PromptList'
import './prompts.css'
import { errorText } from '../../lib/errors'

const GLOBAL_DESC =
  'Prompts the generator sends at each stage. A global override applies to every project; reset it to return to the shipped default.'
const PROJECT_DESC =
  'Overrides saved here apply to this project only, on top of any global override.'

export default function PromptsPage() {
  const { projectKey } = useParams()
  const projectPath = projectKey ? fromProjectKey(projectKey) : undefined
  const scope = projectPath ? 'project' : 'global'
  const [params, setParams] = useSearchParams()
  const list = useIpcQuery('prompts:list', projectPath ? { projectPath } : {})
  const entries = list.data ?? []
  const selected = params.get('name') ?? entries[0]?.name

  return (
    <div className="page page--wide prompts-page">
      <PageHeader
        eyebrow={projectPath ? 'Project' : 'Library'}
        title="Prompts"
        description={projectPath ? PROJECT_DESC : GLOBAL_DESC}
      />
      {list.error && (
        <p className="field__error" role="alert">
          Could not list prompts: {errorText(list.error)}
        </p>
      )}
      {list.isSuccess && entries.length === 0 && (
        <EmptyState
          title="No prompts installed"
          body="Shipped prompt files live in the app's prompts/ folder. None were found."
        />
      )}
      {entries.length > 0 && (
        <div className="prompts-split">
          <PromptList
            entries={entries}
            selected={selected}
            showProject={scope === 'project'}
            onSelect={(name) => setParams({ name })}
          />
          {selected && (
            <PromptEditor name={selected} scope={scope} {...(projectPath ? { projectPath } : {})} />
          )}
        </div>
      )}
    </div>
  )
}
