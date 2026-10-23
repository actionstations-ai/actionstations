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

/** Create the project folder and remember its parent as the default location. */
async function createProject(draft: Draft, dir: string): Promise<OpenProject> {
  const created = await call('project:create', {
    parentDir: dir,
    name: draft.name.trim(),
    orgName: draft.orgName.trim(),
    orgType: draft.orgType,
  })
  await call('settings:update', { defaultProjectsDir: dir })
  return created
}

function NameFields(props: {
  draft: Draft
  nameError: string | undefined
  set: (patch: Partial<Draft>) => void
}) {
  const { draft, set } = props
  return (
    <>
      <Field label="Project name" hint="Also used for the folder name." error={props.nameError}>
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
    </>
  )
}

function LocationField(props: {
  value: string
  error: string | undefined
  onChange: (dir: string) => void
}) {
  const browse = async () => {
    const picked = await call('dialog:open-directory', {
      title: 'Choose where to create the project',
      ...(props.value ? { defaultPath: props.value } : {}),
    })
    if (picked) props.onChange(picked)
  }
  return (
    <Field
      label="Location"
      hint="The project folder is created inside this folder."
      error={props.error}
    >
      {({ id, describedBy, invalid }) => (
        <div className="row">
          <input
            id={id}
            className="input mono"
            value={props.value}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            onChange={(e) => props.onChange(e.target.value)}
          />
          <Button onClick={() => void browse()}>Choose…</Button>
        </div>
      )}
    </Field>
  )
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

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (!draft.name.trim() || !parentDir.trim()) return
    setBusy(true)
    try {
      props.onCreated(await createProject(draft, parentDir.trim()))
    } catch (err) {
      toast.error('Could not create project', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate aria-label="New project">
      <NameFields draft={draft} nameError={nameError} set={set} />
      <DomainProfilePicker value={draft.orgType} onChange={(id) => set({ orgType: id })} />
      <LocationField
        value={parentDir}
        error={dirError}
        onChange={(dir) => set({ parentDir: dir })}
      />
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
