// Decisions in the Live tab (spec 0448 FR-14): the decisions players sent from their devices and
// the ones recorded here, and a form to record one by hand, which also works with no devices.
// The forms come from the scenario's toolkits; with none, this section is not shown.
import { useId, useState } from 'react'
import type { FacilitatorState } from '@shared/ipc/facilitator'
import type { DecisionField, DecisionForm, DecisionRecord } from '@shared/schemas/decisions'
import type { Scenario } from '@shared/schemas/scenario'
import { Badge, Button, Field } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import { errorText } from '../../../lib/errors'
import type { UpdateState } from '../use-delivery-actions'
import {
  allDecisions,
  decisionSummary,
  EMPTY_ENTRY,
  entryProblems,
  type EntryDraft,
} from './decision-model'
import { useLiveDecisions } from './use-live-decisions'

const D = {
  heading: 'Decisions',
  intro:
    'Decisions players send from their devices appear here as they arrive. To record one yourself, fill in the form. Each is saved with its time and role.',
  recordHeading: 'Record a decision',
  form: 'Decision',
  role: 'Made by (optional)',
  anyone: 'Not recorded',
  choose: 'Choose…',
  timeHint: 'Hours and minutes of the exercise clock, for example 1:30.',
  record: 'Record decision',
  recorded: 'Decision recorded',
  listHeading: 'Recorded decisions',
  none: 'No decisions recorded yet.',
  fromDevice: 'From a device',
  fromHere: 'Recorded here',
  problems: (n: number) => (n === 1 ? 'One answer needs a look.' : `${n} answers need a look.`),
} as const

const fail = (title: string) => (e: unknown) => toast.error(title, new Error(errorText(e)))

interface InputProps {
  field: DecisionField
  draft: EntryDraft
  problem: string | undefined
  onChange: (draft: EntryDraft) => void
}

function Control({ field, draft, problem, onChange }: InputProps) {
  const set = (value: string) =>
    onChange({ ...draft, values: { ...draft.values, [field.id]: value } })
  const value = draft.values[field.id] ?? ''
  const hint =
    field.type === 'time'
      ? D.timeHint
      : field.type === 'number' && field.unit
        ? `Unit: ${field.unit}`
        : field.help
  return (
    <Field
      label={`${field.label}${field.required ? ' (required)' : ''}`}
      {...(hint ? { hint } : {})}
      {...(problem ? { error: problem } : {})}
    >
      {({ id, describedBy, invalid }) => {
        const common = {
          id,
          'aria-invalid': invalid || undefined,
          'aria-describedby': describedBy,
        }
        if (field.type === 'choice' || field.type === 'area') {
          const options = field.type === 'choice' ? field.options : field.areas
          const current = field.type === 'area' ? (draft.areaId ?? '') : value
          return (
            <select
              {...common}
              className="select"
              value={current}
              onChange={(e) =>
                field.type === 'area'
                  ? onChange({ ...draft, areaId: e.target.value || undefined })
                  : set(e.target.value)
              }
            >
              <option value="">{D.choose}</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          )
        }
        return field.type === 'text' ? (
          <textarea
            {...common}
            className="input"
            rows={2}
            maxLength={field.maxLength}
            value={value}
            onChange={(e) => set(e.target.value)}
          />
        ) : (
          <input
            {...common}
            className="input"
            type="text"
            inputMode={field.type === 'number' ? 'decimal' : 'numeric'}
            value={value}
            onChange={(e) => set(e.target.value)}
          />
        )
      }}
    </Field>
  )
}

function EntryForm(props: {
  forms: DecisionForm[]
  roles: Scenario['roles']
  record: (form: DecisionForm, draft: EntryDraft) => Promise<DecisionRecord>
  onRecorded: (record: DecisionRecord) => void
}) {
  const { forms, roles } = props
  const pickId = useId()
  const roleId = useId()
  const [formId, setFormId] = useState(forms[0]!.id)
  const [draft, setDraft] = useState<EntryDraft>(EMPTY_ENTRY)
  const [problems, setProblems] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const form = forms.find((f) => f.id === formId) ?? forms[0]!

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const found = entryProblems(form, draft)
    setProblems(found)
    if (Object.keys(found).length) return
    setBusy(true)
    props
      .record(form, draft)
      .then((record) => {
        props.onRecorded(record)
        setDraft(EMPTY_ENTRY)
        void toast.success(D.recorded)
      })
      .catch(fail('Could not record the decision'))
      .finally(() => setBusy(false))
  }

  const count = Object.keys(problems).length
  return (
    <form className="fac-decisions__entry" onSubmit={submit} noValidate>
      <h3 className="fac-panel__subtitle">{D.recordHeading}</h3>
      {forms.length > 1 && (
        <div className="field">
          <label className="field__label" htmlFor={pickId}>
            {D.form}
          </label>
          <select
            id={pickId}
            className="select"
            value={form.id}
            onChange={(e) => {
              setFormId(e.target.value)
              setDraft(EMPTY_ENTRY)
              setProblems({})
            }}
          >
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
          </select>
        </div>
      )}
      {form.description && <p className="muted">{form.description}</p>}
      {count > 0 && (
        <p role="alert" className="field__error">
          {D.problems(count)}
        </p>
      )}
      {form.fields.map((f) => (
        <Control key={f.id} field={f} draft={draft} problem={problems[f.id]} onChange={setDraft} />
      ))}
      <div className="field">
        <label className="field__label" htmlFor={roleId}>
          {D.role}
        </label>
        <select
          id={roleId}
          className="select"
          value={draft.roleId ?? ''}
          onChange={(e) => setDraft({ ...draft, roleId: e.target.value || undefined })}
        >
          <option value="">{D.anyone}</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="primary" disabled={busy}>
        {D.record}
      </Button>
    </form>
  )
}

function History(props: {
  records: DecisionRecord[]
  forms: DecisionForm[]
  roles: Scenario['roles']
}) {
  const roleName = (id: string | undefined) => props.roles.find((r) => r.id === id)?.name ?? id
  return (
    <section aria-labelledby="fac-decisions-history">
      <h3 id="fac-decisions-history" className="fac-panel__subtitle">
        {D.listHeading}
      </h3>
      {props.records.length === 0 ? (
        <p className="muted">{D.none}</p>
      ) : (
        <ul className="fac-surveys__list">
          {props.records.map((r) => (
            <li key={r.id} className="fac-surveys__row">
              <div className="fac-surveys__main">
                <span className="fac-surveys__title">{r.title}</span>
                <span className="muted">
                  {decisionSummary(
                    r,
                    props.forms.find((f) => f.id === r.formId),
                  )}
                </span>
                <span className="muted">
                  {r.exerciseTime ? `at ${r.exerciseTime}` : r.time.slice(11, 16)}
                  {r.seat.roleId ? ` · ${roleName(r.seat.roleId)}` : ''}
                  {r.seat.name ? ` · ${r.seat.name}` : ''}
                </span>
                <Badge tone="info">{r.source === 'device' ? D.fromDevice : D.fromHere}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function LiveDecisionsSection(props: {
  projectPath: string
  scenario: Scenario
  state: FacilitatorState
  update: UpdateState
}) {
  const live = useLiveDecisions(props.projectPath, props.scenario.id)
  const saved = props.state.decisionRecords
  if (live.forms.length === 0 && !saved?.length && live.decisions.length === 0) return null
  const records = allDecisions(live.decisions, saved)
  return (
    <section className="fac-surveys" aria-labelledby="fac-decisions-title">
      <h2 id="fac-decisions-title" className="live-heading">
        {D.heading}
      </h2>
      <p className="muted">{D.intro}</p>
      {live.forms.length > 0 && (
        <EntryForm
          key={live.forms.map((f) => f.id).join()}
          forms={live.forms}
          roles={props.scenario.roles}
          record={live.record}
          onRecorded={(record) =>
            props.update((s: FacilitatorState) => ({
              ...s,
              decisionRecords: [...(s.decisionRecords ?? []), record],
            }))
          }
        />
      )}
      <History records={records} forms={live.forms} roles={props.scenario.roles} />
    </section>
  )
}
