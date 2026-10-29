// Create a regression drill (#431, FR-8): pick the scenario that was exercised; every row whose
// criteria were last rated not met or partial is preselected, and rows can be added or removed.
import { useState } from 'react'
import type { ScenarioMeta } from '@shared/schemas'
import { Button, Dialog, Field } from '../../components/ui'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'

const CONTROL = new Set(['STARTEX', 'TIME_JUMP', 'ENDEX'])

export function CreateDrillDialog(props: {
  projectPath: string
  scenarios: ScenarioMeta[]
  initialScenarioId?: string
  onClose: () => void
}) {
  const [scenarioId, setScenarioId] = useState(
    props.initialScenarioId ?? props.scenarios[0]?.id ?? '',
  )
  const [title, setTitle] = useState('')
  const [rows, setRows] = useState<string[] | null>(null)
  const [error, setError] = useState('')
  const draft = useIpcQuery(
    'drills:draft',
    { projectPath: props.projectPath, scenarioId },
    { enabled: !!scenarioId },
  )
  const scenario = useIpcQuery(
    'scenarios:get',
    { projectPath: props.projectPath, scenarioId },
    { enabled: !!scenarioId },
  )
  const chosen = rows ?? draft.data?.rowIds ?? []
  const candidates = (scenario.data?.msel ?? []).filter((r) => !CONTROL.has(r.purposeTag))
  const failed = new Set(draft.data?.rowIds ?? [])
  const save = async () => {
    if (!draft.data) return
    setError('')
    try {
      await call('drills:save', {
        projectPath: props.projectPath,
        drill: { ...draft.data, title: title.trim() || draft.data.title, rowIds: chosen },
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
      title="Create a regression drill"
      description="A short copy of the scenario with the injects that failed, to run again after the plans were updated."
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!chosen.length || !draft.data}
            onClick={() => void save()}
          >
            Create drill
          </Button>
        </>
      }
    >
      <Field label="Scenario that was exercised">
        {({ id }) => (
          <select
            id={id}
            className="select"
            value={scenarioId}
            onChange={(e) => {
              setScenarioId(e.target.value)
              setRows(null)
              setTitle('')
            }}
          >
            {props.scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Drill name">
        {({ id }) => (
          <input
            id={id}
            className="input"
            value={title}
            placeholder={draft.data?.title ?? ''}
            onChange={(e) => setTitle(e.target.value)}
          />
        )}
      </Field>
      {draft.isError && (
        <p className="field__error" role="alert">
          {errorText(draft.error)}
        </p>
      )}
      {draft.data && !draft.data.rowIds.length && (
        <p className="muted">
          No criterion of this scenario was rated not met or partial. Choose the injects to replay
          by hand.
        </p>
      )}
      <fieldset className="drill-rows">
        <legend>Injects to replay</legend>
        {candidates.map((r) => (
          <label key={r.id} className="drill-rows__row">
            <input
              type="checkbox"
              checked={chosen.includes(r.id)}
              onChange={(e) =>
                setRows(e.target.checked ? [...chosen, r.id] : chosen.filter((x) => x !== r.id))
              }
            />
            <span>
              <strong>{r.id}</strong> {r.time} {r.event.slice(0, 90)}
              {failed.has(r.id) && <span className="muted"> (not met or partial)</span>}
            </span>
          </label>
        ))}
      </fieldset>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  )
}
