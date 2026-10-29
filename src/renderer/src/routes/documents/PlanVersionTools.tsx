// Plan versions and redlines on a document (#431): say which earlier plan this document
// replaces, so proposals made against that plan can be checked against this one, and start a
// proposal from the words selected in the text.
import { useNavigate } from 'react-router'
import type { DocumentMeta } from '@shared/schemas/project'
import { Button, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { projectKey } from '../../state/project'

const MAX_SELECTION = 2000

export function PlanVersionTools(props: { projectPath: string; doc: DocumentMeta }) {
  const { projectPath, doc } = props
  const navigate = useNavigate()
  const docs = useIpcQuery('documents:list', { projectPath })
  const others = (docs.data ?? []).filter((d) => d.id !== doc.id)
  const setSupersedes = async (id: string) => {
    try {
      await call('documents:update', {
        projectPath,
        documentId: doc.id,
        patch: { supersedesDocumentId: id || null },
      })
      if (id) {
        const checked = await call('redlines:check-applied', { projectPath, documentId: doc.id })
        toast.success(
          'Plan version linked',
          checked.length
            ? `${checked.length} proposal${checked.length === 1 ? '' : 's'} checked against this plan.`
            : 'No proposals were made against the earlier plan.',
        )
      }
    } catch (e) {
      toast.error('Could not link the plans', errorText(e))
    }
  }
  const fromSelection = () => {
    const text = window.getSelection()?.toString().trim().slice(0, MAX_SELECTION) ?? ''
    if (!text)
      return toast.info('Select some text first', 'Select the words to change in the Text tab.')
    navigate(
      `/p/${projectKey(projectPath)}/redlines?doc=${encodeURIComponent(doc.id)}&excerpt=${encodeURIComponent(text)}`,
    )
  }
  return (
    <div className="doc-versions">
      <Field
        label="This plan replaces"
        hint="Link a new version to the one it replaces, to check proposals against it."
      >
        {({ id, describedBy }) => (
          <select
            id={id}
            aria-describedby={describedBy}
            className="select"
            value={doc.supersedesDocumentId ?? ''}
            onChange={(e) => void setSupersedes(e.target.value)}
          >
            <option value="">No earlier version</option>
            {others.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Button size="sm" onClick={fromSelection}>
        Propose redline from selection
      </Button>
    </div>
  )
}
