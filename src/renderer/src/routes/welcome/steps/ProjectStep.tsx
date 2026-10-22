// Step 5: create the first project folder.
import { useState } from 'react'
import { Badge, Button, Field } from '../../../components/ui'
import { call } from '../../../lib/api'
import { queryClient, useIpcQuery } from '../../../lib/query'
import { useProjectUi } from '../../../state/project'
import { DomainProfilePicker } from '../../../components/DomainProfilePicker'
import { StepLayout } from '../StepLayout'
import { ExamplesList } from '../../projects/ExamplesSection'
import { useAction } from '../use-setup'

interface Draft {
  name: string
  orgName: string
  orgType: string
  parentDir: string | null
}

function TextField(props: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
  error?: string | undefined
  placeholder?: string
}) {
  return (
    <Field
      label={props.label}
      {...(props.hint ? { hint: props.hint } : {})}
      {...(props.error ? { error: props.error } : {})}
    >
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          className="input"
          value={props.value}
          placeholder={props.placeholder}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
    </Field>
  )
}

function LocationField(props: {
  value: string
  error?: string | undefined
  onChange: (v: string) => void
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
      {...(props.error ? { error: props.error } : {})}
    >
      {({ id, describedBy, invalid }) => (
        <div className="row">
          <input
            id={id}
            className="input mono"
            value={props.value}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            onChange={(e) => props.onChange(e.target.value)}
          />
          <Button onClick={() => void browse()}>Choose…</Button>
        </div>
      )}
    </Field>
  )
}

export function ProjectStep(props: {
  createdPath?: string | undefined
  onBack: () => void
  onCreated: (path: string) => void
  onSkip: () => void
}) {
  const settings = useIpcQuery('settings:get', undefined)
  const setProjectPath = useProjectUi((s) => s.setProjectPath)
  const [draft, setDraft] = useState<Draft>({
    name: '',
    orgName: '',
    orgType: 'generic',
    parentDir: null,
  })
  const [submitted, setSubmitted] = useState(false)
  const action = useAction()
  const parentDir = draft.parentDir ?? settings.data?.defaultProjectsDir ?? ''
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const nameError = submitted && !draft.name.trim() ? 'Give the project a name.' : undefined
  const dirError = submitted && !parentDir.trim() ? 'Choose where to create it.' : undefined

  const create = async () => {
    setSubmitted(true)
    if (!draft.name.trim() || !parentDir.trim()) return
    await action.run(async () => {
      const created = await call('project:create', {
        parentDir: parentDir.trim(),
        name: draft.name.trim(),
        orgName: draft.orgName.trim(),
        orgType: draft.orgType,
      })
      await call('settings:update', { defaultProjectsDir: parentDir.trim() })
      setProjectPath(created.path)
      await queryClient.invalidateQueries({ queryKey: ['project:list-recent'] })
      props.onCreated(created.path)
    })
  }

  if (props.createdPath)
    return (
      <StepLayout title="Your first project" onBack={props.onBack} onNext={props.onSkip}>
        <p>
          <Badge tone="ok">Created</Badge> <span className="mono">{props.createdPath}</span>
        </p>
      </StepLayout>
    )

  return (
    <StepLayout
      title="Create your first project"
      intro={
        <p>
          A project is a folder holding one organization&rsquo;s source documents and the exercises
          built from them.
        </p>
      }
      onBack={props.onBack}
      onNext={() => void create()}
      nextLabel="Create project"
      busy={action.busy}
      secondary={
        <Button variant="ghost" onClick={props.onSkip}>
          Skip for now
        </Button>
      }
    >
      <div className="card stack">
        <TextField
          label="Project name"
          hint="Also used for the folder name."
          value={draft.name}
          error={nameError}
          placeholder="Northfield Regional Airport"
          onChange={(name) => set({ name })}
        />
        <TextField
          label="Organization"
          value={draft.orgName}
          placeholder="Northfield Regional Airport Authority"
          onChange={(orgName) => set({ orgName })}
        />
        <DomainProfilePicker value={draft.orgType} onChange={(id) => set({ orgType: id })} />
        <LocationField value={parentDir} error={dirError} onChange={(v) => set({ parentDir: v })} />
      </div>
      {action.error && (
        <p className="field__error" role="alert">
          Could not create the project: {action.error}
        </p>
      )}
      <ExamplesList
        heading="Or explore an example"
        headingLevel="h3"
        onOpened={(p) => {
          setProjectPath(p.path)
          void queryClient.invalidateQueries({ queryKey: ['project:list-recent'] })
          props.onCreated(p.path)
        }}
      />
    </StepLayout>
  )
}
