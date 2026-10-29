// The small dialogs of the hot wash board (#415): name a group, correct an item's text, and tag
// an item with an objective, a capability and an inject. Each is a form with visible labels.
import { useId, useState } from 'react'
import { capabilityName } from '@shared/core-capabilities'
import type { Scenario } from '@shared/schemas/scenario'
import { Button, Dialog } from '../../../components/ui'
import type { UpdateRequest } from './use-live-hotwash'

export function LabelDialog(props: {
  open: boolean
  initial: string
  onClose: () => void
  onSave: (label: string) => void
}) {
  const id = useId()
  const [label, setLabel] = useState(props.initial)
  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => !o && props.onClose()}
      title="Name this group"
      description="A short finding the room agrees on. It shows on devices and, once promoted, in the report."
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => props.onSave(label.trim())}>
            Save name
          </Button>
        </>
      }
    >
      <div className="field">
        <label className="field__label" htmlFor={id}>
          Group name
        </label>
        <input
          id={id}
          className="input"
          maxLength={120}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
    </Dialog>
  )
}

export function EditDialog(props: {
  open: boolean
  initial: string
  onClose: () => void
  onSave: (text: string) => void
}) {
  const id = useId()
  const [text, setText] = useState(props.initial)
  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => !o && props.onClose()}
      title="Edit text"
      description="Fix a typo or tighten the wording. The original stays in the session log."
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" disabled={!text.trim()} onClick={() => props.onSave(text)}>
            Save text
          </Button>
        </>
      }
    >
      <div className="field">
        <label className="field__label" htmlFor={id}>
          Item text
        </label>
        <textarea
          id={id}
          className="textarea"
          rows={4}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
    </Dialog>
  )
}

type Tags = NonNullable<UpdateRequest['tags']>

export function TagDialog(props: {
  open: boolean
  scenario: Scenario
  onClose: () => void
  onSave: (tags: Tags) => void
}) {
  const ids = useId()
  const [objectiveId, setObjective] = useState('')
  const [capability, setCapability] = useState('')
  const [mselRowId, setRow] = useState('')
  const capabilities = [...new Set(props.scenario.evaluation.eegs.map((e) => e.capability))]
  // A blank choice leaves that tag as it is; it never clears one.
  const tags: Tags = {
    ...(objectiveId ? { objectiveId } : {}),
    ...(capability ? { capability } : {}),
    ...(mselRowId ? { mselRowId } : {}),
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => !o && props.onClose()}
      title="Tag"
      description="Link the selected items to an objective, a capability or an inject. Blank choices change nothing."
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={Object.keys(tags).length === 0}
            onClick={() => props.onSave(tags)}
          >
            Apply tags
          </Button>
        </>
      }
    >
      <div className="field">
        <label className="field__label" htmlFor={`${ids}-o`}>
          Objective
        </label>
        <select
          id={`${ids}-o`}
          className="select"
          value={objectiveId}
          onChange={(e) => setObjective(e.target.value)}
        >
          <option value="">Leave as is</option>
          {props.scenario.objectives.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name || o.text}
            </option>
          ))}
        </select>
      </div>
      {capabilities.length > 0 && (
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-c`}>
            Capability
          </label>
          <select
            id={`${ids}-c`}
            className="select"
            value={capability}
            onChange={(e) => setCapability(e.target.value)}
          >
            <option value="">Leave as is</option>
            {capabilities.map((c) => (
              <option key={c} value={c}>
                {capabilityName(c)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label className="field__label" htmlFor={`${ids}-r`}>
          Inject
        </label>
        <select
          id={`${ids}-r`}
          className="select"
          value={mselRowId}
          onChange={(e) => setRow(e.target.value)}
        >
          <option value="">Leave as is</option>
          {props.scenario.msel.map((r) => (
            <option key={r.id} value={r.id}>
              {r.id} · {r.time}
            </option>
          ))}
        </select>
      </div>
    </Dialog>
  )
}
