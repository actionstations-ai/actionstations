import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { ScenarioMeta } from '@shared/schemas/project'
import { Button, Dialog, EmptyState, PageHeader } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { useIpcMutation, useIpcQuery } from '../../lib/query'
import { fromProjectKey, projectKey } from '../../state/project'
import { ScenarioCard } from './ScenarioCard'
import './scenarios.css'

function DeleteDialog(props: {
  meta: ScenarioMeta | null
  onCancel: () => void
  onConfirm: (meta: ScenarioMeta) => void
}) {
  const meta = props.meta
  return (
    <Dialog
      open={!!meta}
      onOpenChange={(open) => !open && props.onCancel()}
      title="Delete scenario?"
      {...(meta
        ? {
            description: `“${meta.title}” and its injects, documents, media and history will be deleted from the project folder. This cannot be undone.`,
          }
        : {})}
      footer={
        <>
          <Button onClick={props.onCancel}>Cancel</Button>
          <Button variant="danger" onClick={() => meta && props.onConfirm(meta)}>
            Delete
          </Button>
        </>
      }
    >
      {null}
    </Dialog>
  )
}

export default function ScenariosPage() {
  const projectPath = fromProjectKey(useParams().projectKey ?? '')
  const navigate = useNavigate()
  const list = useIpcQuery('scenarios:list', { projectPath }, { enabled: !!projectPath })
  const duplicate = useIpcMutation('scenarios:duplicate', { invalidates: ['scenarios:list'] })
  const remove = useIpcMutation('scenarios:delete', { invalidates: ['scenarios:list'] })
  const [pendingDelete, setPendingDelete] = useState<ScenarioMeta | null>(null)
  const toGenerate = () => navigate(`/p/${projectKey(projectPath)}/generate`)

  const onDuplicate = (meta: ScenarioMeta) =>
    duplicate.mutate(
      { projectPath, scenarioId: meta.id },
      {
        onSuccess: (s) => toast.success(`Duplicated as “${s.title}”`),
        onError: (e) => toast.error('Could not duplicate', e.message),
      },
    )
  const onDelete = (meta: ScenarioMeta) => {
    setPendingDelete(null)
    remove.mutate(
      { projectPath, scenarioId: meta.id },
      { onError: (e) => toast.error('Could not delete', e.message) },
    )
  }

  const items = list.data ?? []
  return (
    <div className="page scenarios-page">
      <PageHeader
        eyebrow="Project"
        title="Scenarios"
        description="Each scenario is a complete exercise: overview, objectives, phased MSEL, injects and facilitator documents."
        actions={
          <Button variant="primary" onClick={toGenerate}>
            <Plus size={16} aria-hidden /> New scenario
          </Button>
        }
      />
      {list.isError && (
        <p className="field__error" role="alert">
          Could not load scenarios: {list.error.message}
        </p>
      )}
      {list.isSuccess && items.length === 0 && (
        <EmptyState
          title="No scenarios yet"
          body="Describe a threat or ask for ideas grounded in this project's documents."
          actions={
            <Button variant="primary" onClick={toGenerate}>
              Generate a scenario
            </Button>
          }
        />
      )}
      {items.length > 0 && (
        <ul className="grid-cards" aria-label="Scenarios">
          {items.map((m) => (
            <ScenarioCard
              key={m.id}
              projectPath={projectPath}
              meta={m}
              onDuplicate={onDuplicate}
              onDelete={setPendingDelete}
            />
          ))}
        </ul>
      )}
      <DeleteDialog
        meta={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={onDelete}
      />
    </div>
  )
}
