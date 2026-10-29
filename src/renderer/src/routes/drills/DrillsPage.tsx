// Regression drills (#431): replay the injects that failed, under the updated plans, and watch
// the results over time.
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Button, EmptyState, PageHeader } from '../../components/ui'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { CreateDrillDialog } from './CreateDrillDialog'
import { DrillCard } from './DrillCard'
import './drills.css'

export default function DrillsPage() {
  const params = useParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const [search] = useSearchParams()
  const [creating, setCreating] = useState(!!search.get('create'))
  const drills = useIpcQuery('drills:list', { projectPath })
  const scenarios = useIpcQuery('scenarios:list', { projectPath })
  const list = drills.data ?? []
  return (
    <div className="page drills-page">
      <PageHeader
        eyebrow="After the exercise"
        title="Drills"
        description="A drill replays only the injects that failed, after the plans were changed, and records whether the gap closed."
        actions={
          <Button
            variant="primary"
            disabled={!scenarios.data?.length}
            onClick={() => setCreating(true)}
          >
            <Plus size={16} aria-hidden /> Create drill
          </Button>
        }
      />
      {drills.isError && (
        <p className="field__error" role="alert">
          Could not load the drills: {errorText(drills.error)}
        </p>
      )}
      {!drills.isPending && !list.length && (
        <EmptyState
          title="No drills yet"
          body="After an exercise, rate each inject's criteria in Facilitate, then create a drill from the ones that were not met."
        />
      )}
      <ul className="drill-list">
        {list.map((d) => (
          <DrillCard key={d.id} drill={d} projectPath={projectPath} />
        ))}
      </ul>
      {creating && (
        <CreateDrillDialog
          projectPath={projectPath}
          scenarios={scenarios.data ?? []}
          {...(search.get('scenario') ? { initialScenarioId: search.get('scenario')! } : {})}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  )
}
