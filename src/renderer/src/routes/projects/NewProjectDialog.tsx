import { useState, type FormEvent } from 'react'
import type { OpenProject } from '@shared/schemas'
import { Button, Dialog, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { useIpcQuery } from '../../lib/query'
import { DomainProfilePicker } from '../../components/DomainProfilePicker'

interface Draft {
  name: string
  orgName: string
  orgType: string
  parentDir: string | null
}

function NewProjectForm(props: {
  defaultParent: string
  onCreated: (p: OpenProject) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<Draft>({
    name: '',
    orgName: '',
    orgType: 'generic',
    parentDir: null,
  })
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const parentDir = draft.parentDir ?? props.defaultParent
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const nameError = submitted && !draft.name.trim() ? 'Give the project a name.' : undefined
  const dirError = submitted && !parentDir.trim() ? 'Choose where to create it.' : undefined

  const browse = async () => {
    const picked = await call('dialog:open-directory', {
      title: 'Choose where to create the project',
      ...(parentDir ? { defaultPath: parentDir } : {}),
    })
    if (picked) set({ parentDir: picked })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (!draft.name.trim() || !parentDir.trim()) return
    setBusy(true)
    try {
      const dir = parentDir.trim()
      const created = await call('project:create', {
        parentDir: dir,
        name: draft.name.trim(),
        orgName: draft.orgName.trim(),
        orgType: draft.orgType,
      })
      await call('settings:update', { defaultProjectsDir: dir })
      props.onCreated(created)
    } catch (err) {
      toast.error('Could not create project', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate aria-label="New project">
      <Field label="Project name" hint="Also used for the folder name." error={nameError}>
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            className="input"
            autoFocus
            value={draft.name}
            placeholder="Northfield Regional Airport"
            aria-describedby={describedBy}
            aria-invalid={invalid}
            onChange={(e) => set({ name: e.target.value })}
          />
        )}
      </Field>
      <Field label="Organization">
        {({ id }) => (
          <input
            id={id}
            className="input"
            value={draft.orgName}
            placeholder="Northfield Regional Airport Authority"
            onChange={(e) => set({ orgName: e.target.value })}
          />
        )}
      </Field>
      <DomainProfilePicker value={draft.orgType} onChange={(id) => set({ orgType: id })} />
      <Field
        label="Location"
        hint="The project folder is created inside this folder."
        error={dirError}
      >
        {({ id, describedBy, invalid }) => (
          <div className="row">
            <input
              id={id}
              className="input mono"
              value={parentDir}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => set({ parentDir: e.target.value })}
            />
            <Button onClick={() => void browse()}>Choose…</Button>
          </div>
        )}
      </Field>
      <div className="dialog__footer">
        <Button onClick={props.onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create project'}
        </Button>
      </div>
    </form>
  )
}

export function NewProjectDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (p: OpenProject) => void
}) {
  const settings = useIpcQuery('settings:get', undefined)
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="New project"
      description="A project is a folder holding one organization's source documents and the exercises built from them."
    >
      {props.open && (
        <NewProjectForm
          defaultParent={settings.data?.defaultProjectsDir ?? ''}
          onCreated={props.onCreated}
          onCancel={() => props.onOpenChange(false)}
        />
      )}
    </Dialog>
  )
}
