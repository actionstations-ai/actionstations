// A proposal written by hand (#431, FR-3): the plan, the section, the words to change and the
// new words. Main checks that the words are in the section before it saves anything.
import { useMemo, useState } from 'react'
import type { ScenarioMeta } from '@shared/schemas'
import { Button, Dialog, Field } from '../../components/ui'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'

export function ManualDialog(props: {
  projectPath: string
  scenarios: ScenarioMeta[]
  scenarioId: string
  documentId?: string
  excerpt?: string
  onClose: () => void
}) {
  const docs = useIpcQuery('documents:list', { projectPath: props.projectPath })
  const [scenarioId, setScenarioId] = useState(props.scenarioId || props.scenarios[0]?.id || '')
  const [documentId, setDocumentId] = useState(props.documentId ?? '')
  const [heading, setHeading] = useState('')
  const [excerpt, setExcerpt] = useState(props.excerpt ?? '')
  const [proposed, setProposed] = useState(props.excerpt ?? '')
  const [why, setWhy] = useState('')
  const [error, setError] = useState('')
  const chunks = useIpcQuery(
    'documents:chunks',
    { projectPath: props.projectPath, documentId, limit: 500, offset: 0 },
    { enabled: !!documentId },
  )
  const headings = useMemo(
    () => [...new Set((chunks.data ?? []).map((c) => c.headingPath))],
    [chunks.data],
  )
  // Pre-select the section that holds the selected words.
  const holding = (chunks.data ?? []).find(
    (c) => !!excerpt.trim() && c.text.includes(excerpt.trim()),
  )
  const section = heading || holding?.headingPath || headings[0] || ''
  const save = async () => {
    setError('')
    const scenario = props.scenarios.find((s) => s.id === scenarioId)
    const doc = docs.data?.find((d) => d.id === documentId)
    if (!scenario || !doc) return setError('Choose the scenario and the plan.')
    try {
      await call('redlines:create', {
        projectPath: props.projectPath,
        redline: {
          projectId: 'x',
          source: {
            scenarioId,
            scenarioTitle: scenario.title,
            aarCorrectiveActionIds: [],
            correctiveActionIds: [],
            criterionIds: [],
          },
          target: {
            documentId,
            documentTitle: doc.title,
            headingPath: section,
            sourceKind: 'text',
          },
          originalExcerpt: excerpt,
          proposedText: proposed,
          rationale: why,
        },
      })
      props.onClose()
    } catch (e) {
      setError(errorText(e))
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && props.onClose()}
      title="Add a proposal by hand"
      description="Copy the words to change from the plan exactly, then write the new wording."
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!documentId || !excerpt.trim() || !proposed.trim()}
            onClick={() => void save()}
          >
            Add proposal
          </Button>
        </>
      }
    >
      <Field label="Scenario">
        {({ id }) => (
          <select
            id={id}
            className="select"
            value={scenarioId}
            onChange={(e) => setScenarioId(e.target.value)}
          >
            {props.scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Plan">
        {({ id }) => (
          <select
            id={id}
            className="select"
            value={documentId}
            onChange={(e) => {
              setDocumentId(e.target.value)
              setHeading('')
            }}
          >
            <option value="">Choose a plan</option>
            {(docs.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Section">
        {({ id }) => (
          <select
            id={id}
            className="select"
            value={section}
            onChange={(e) => setHeading(e.target.value)}
          >
            {headings.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Current text">
        {({ id }) => (
          <textarea
            id={id}
            className="textarea"
            rows={3}
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
          />
        )}
      </Field>
      <Field label="Proposed text">
        {({ id }) => (
          <textarea
            id={id}
            className="textarea"
            rows={3}
            value={proposed}
            onChange={(e) => setProposed(e.target.value)}
          />
        )}
      </Field>
      <Field label="Why (optional)">
        {({ id }) => (
          <input id={id} className="input" value={why} onChange={(e) => setWhy(e.target.value)} />
        )}
      </Field>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  )
}
