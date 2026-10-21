import { useState, type FormEvent } from 'react'
import type { OpenProject, RecentProject } from '@shared/schemas'
import { Button, Dialog, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'

function DuplicateForm(props: {
  source: RecentProject
  onDone: (p: OpenProject) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(`${props.source.name} (copy)`)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const error = submitted && !name.trim() ? 'Give the copy a name.' : undefined

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (!name.trim()) return
    setBusy(true)
    try {
      props.onDone(
        await call('project:duplicate', { path: props.source.path, newName: name.trim() }),
      )
    } catch (err) {
      toast.error('Could not duplicate project', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate aria-label="Duplicate project">
      <Field
        label="Name of the copy"
        hint="Created next to the original. Documents, scenarios and prompts are copied; the search index is rebuilt."
        error={error}
      >
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            className="input"
            autoFocus
            value={name}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <div className="dialog__footer">
        <Button onClick={props.onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Duplicating…' : 'Duplicate'}
        </Button>
      </div>
    </form>
  )
}

export function DuplicateDialog(props: {
  source: RecentProject | null
  onClose: () => void
  onDone: (p: OpenProject) => void
}) {
  return (
    <Dialog
      open={!!props.source}
      onOpenChange={(open) => !open && props.onClose()}
      title={props.source ? `Duplicate “${props.source.name}”` : 'Duplicate project'}
    >
      {props.source && (
        <DuplicateForm source={props.source} onDone={props.onDone} onCancel={props.onClose} />
      )}
    </Dialog>
  )
}
