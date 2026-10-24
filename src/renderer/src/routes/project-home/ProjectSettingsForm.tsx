import { useState, type FormEvent } from 'react'
import type { Project } from '@shared/schemas'
import { Button, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { useIpcMutation } from '../../lib/query'
import { AliasesEditor } from './AliasesEditor'
import { LogoPicker } from './LogoPicker'
import { RolesEditor } from './RolesEditor'
import { VocabularyEditor } from './VocabularyEditor'
import { PackProfileUpdate } from './PackProfileUpdate'
import { DomainProfilePicker } from '../../components/DomainProfilePicker'
import {
  isDirty,
  toFormState,
  toPatch,
  validateForm,
  type FormErrors,
  type ProjectFormState,
} from './form'

type SetField = <K extends keyof ProjectFormState>(key: K, value: ProjectFormState[K]) => void

interface SectionProps {
  form: ProjectFormState
  errors: FormErrors
  set: SetField
}

function OrganizationSection({
  form,
  errors,
  set,
  path,
  project,
}: SectionProps & { path: string; project: Project }) {
  // The snapshot follows the saved orgType; while another domain is picked it does not apply.
  const snapshot = project.domainProfileSnapshot
  const onSnapshot = snapshot && form.orgType === project.orgType
  return (
    <fieldset className="form-section">
      <legend>Organization</legend>
      <div className="form-grid">
        <Field label="Project name" error={errors.name}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              className="input"
              value={form.name}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => set('name', e.target.value)}
            />
          )}
        </Field>
        <Field label="Organization name" hint="As it should appear in briefings and injects.">
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input"
              value={form.orgName}
              aria-describedby={describedBy}
              onChange={(e) => set('orgName', e.target.value)}
            />
          )}
        </Field>
      </div>
      <DomainProfilePicker
        value={form.orgType}
        snapshot={snapshot}
        onChange={(id) => set('orgType', id)}
      />
      {onSnapshot && <PackProfileUpdate path={path} snapshot={snapshot} />}
      <VocabularyEditor
        orgType={form.orgType}
        overrides={form.overrides}
        snapshot={onSnapshot ? snapshot : undefined}
        onChange={(o) => set('overrides', o)}
      />
    </fieldset>
  )
}

function BrandSection({
  form,
  errors,
  set,
  path,
  project,
}: SectionProps & { path: string; project: Project }) {
  const validColor = /^#[0-9a-fA-F]{6}$/.test(form.primaryColor)
  return (
    <fieldset className="form-section">
      <legend>Brand and locale</legend>
      <p className="muted">
        Templates read these instead of hard-coding names, so a tweet or news ticker names the right
        city, airline or TV station.
      </p>
      <div className="form-grid">
        <Field label="City">
          {({ id }) => (
            <input
              id={id}
              className="input"
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
            />
          )}
        </Field>
        <Field label="Region" hint="State, province or county.">
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input"
              value={form.region}
              aria-describedby={describedBy}
              onChange={(e) => set('region', e.target.value)}
            />
          )}
        </Field>
        <Field label="Primary color" hint="Hex, e.g. #1F4E79." error={errors.primaryColor}>
          {({ id, describedBy, invalid }) => (
            <div className="row">
              <span
                className="color-swatch"
                aria-hidden
                style={validColor ? { background: form.primaryColor } : undefined}
              />
              <input
                id={id}
                className="input mono"
                value={form.primaryColor}
                placeholder="#1F4E79"
                aria-describedby={describedBy}
                aria-invalid={invalid}
                onChange={(e) => set('primaryColor', e.target.value)}
              />
            </div>
          )}
        </Field>
      </div>
      <LogoPicker path={path} project={project} />
      <AliasesEditor rows={form.aliases} errors={errors} onChange={(v) => set('aliases', v)} />
    </fieldset>
  )
}

export function ProjectSettingsForm({ path, project }: { path: string; project: Project }) {
  const [form, setForm] = useState(() => toFormState(project))
  const [showErrors, setShowErrors] = useState(false)
  const update = useIpcMutation('project:update', {
    invalidates: ['project:get', 'project:list-recent'],
  })
  const set: SetField = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const errors = validateForm(form)
  const shownErrors = showErrors ? errors : {}
  const dirty = isDirty(form, project)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (Object.keys(errors).length > 0) {
      setShowErrors(true)
      return
    }
    update.mutate(
      { path, patch: toPatch(form) },
      {
        onSuccess: () => toast.success('Project settings saved'),
        onError: (err) => toast.error('Could not save project settings', err),
      },
    )
  }

  return (
    <form className="card stack project-settings" onSubmit={onSubmit} noValidate>
      <div className="project-settings__header">
        <h2>Project settings</h2>
        <div className="row">
          <Button
            disabled={!dirty || update.isPending}
            onClick={() => setForm(toFormState(project))}
          >
            Discard changes
          </Button>
          <Button type="submit" variant="primary" disabled={!dirty || update.isPending}>
            {update.isPending ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </div>
      <OrganizationSection
        form={form}
        errors={shownErrors}
        set={set}
        path={path}
        project={project}
      />
      <BrandSection form={form} errors={shownErrors} set={set} path={path} project={project} />
      <RolesEditor roles={form.roles} errors={shownErrors} onChange={(v) => set('roles', v)} />
    </form>
  )
}
