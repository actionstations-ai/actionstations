// One planned exercise of the IPP schedule: type, when, the priorities and capabilities it
// addresses, the corrective actions it will verify, and the scenario once one exists (FR-8, FR-9).
import { useState } from 'react'
import { actionLabel } from '@shared/program/status'
import {
  EXERCISE_TYPES,
  EXERCISE_TYPE_LABELS,
  type PlannedExercise,
  type Program,
} from '@shared/schemas'
import { Button, Dialog, Field } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { CapabilityPicker } from './CapabilityPicker'

export function PlannedExerciseForm(props: {
  programPath: string
  program: Program
  initial: PlannedExercise
  isNew: boolean
  onSave: (e: PlannedExercise) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [e, setE] = useState<PlannedExercise>(props.initial)
  const [error, setError] = useState('')
  const actions = useIpcQuery('program:actions-list', { programPath: props.programPath })
  const snaps = useIpcQuery('program:snapshots', { programPath: props.programPath })
  const scenarios = (snaps.data ?? []).flatMap((s) =>
    s.scenarios.map((sc) => ({ projectId: s.projectId, project: s.name, ...sc })),
  )
  const set = <K extends keyof PlannedExercise>(k: K, v: PlannedExercise[K]) =>
    setE((cur) => ({ ...cur, [k]: v }))
  const when = 'date' in e.when ? undefined : e.when
  const toggle = (key: 'priorityIds' | 'correctiveActionIds', id: string) =>
    setE((cur) => ({
      ...cur,
      [key]: cur[key].includes(id) ? cur[key].filter((x) => x !== id) : [...cur[key], id],
    }))

  const save = () => {
    if (!e.title.trim()) return setError('Give the exercise a title.')
    props.onSave({ ...e, title: e.title.trim() })
  }
  const linked = e.projectId && e.scenarioId ? `${e.projectId}|${e.scenarioId}` : ''
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && props.onClose()}
      title={props.isNew ? 'Plan an exercise' : 'Edit planned exercise'}
      className="program-drawer"
      footer={
        <>
          {!props.isNew && (
            <Button variant="danger" onClick={props.onDelete}>
              Remove from schedule
            </Button>
          )}
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Title" {...(error ? { error } : {})}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              className="input"
              value={e.title}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(ev) => {
                set('title', ev.target.value)
                setError('')
              }}
            />
          )}
        </Field>
        <div className="row program-form-row">
          <Field label="Type">
            {({ id }) => (
              <select
                id={id}
                className="select"
                value={e.type}
                onChange={(ev) => set('type', ev.target.value as PlannedExercise['type'])}
              >
                {EXERCISE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EXERCISE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Status">
            {({ id }) => (
              <select
                id={id}
                className="select"
                value={e.status}
                onChange={(ev) => set('status', ev.target.value as PlannedExercise['status'])}
              >
                <option value="planned">Planned</option>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            )}
          </Field>
        </div>
        <div className="row program-form-row">
          <Field label="Year">
            {({ id }) => (
              <input
                id={id}
                className="input"
                inputMode="numeric"
                value={when ? when.year : ''}
                disabled={!when}
                onChange={(ev) =>
                  when &&
                  set('when', { year: Number(ev.target.value) || when.year, quarter: when.quarter })
                }
              />
            )}
          </Field>
          <Field label="Quarter">
            {({ id }) => (
              <select
                id={id}
                className="select"
                value={when ? when.quarter : ''}
                disabled={!when}
                onChange={(ev) =>
                  when && set('when', { year: when.year, quarter: Number(ev.target.value) })
                }
              >
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    Q{q}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Exact date (optional)">
            {({ id }) => (
              <input
                id={id}
                type="date"
                className="input"
                value={'date' in e.when ? e.when.date : ''}
                onChange={(ev) =>
                  set(
                    'when',
                    ev.target.value
                      ? { date: ev.target.value }
                      : { year: props.program.cycle.startYear, quarter: 1 },
                  )
                }
              />
            )}
          </Field>
        </div>
        {props.program.priorities.length > 0 && (
          <fieldset className="program-capabilities">
            <legend className="field__label">Program priorities it addresses</legend>
            {props.program.priorities.map((p, i) => (
              <label key={p.id} className="row">
                <input
                  type="checkbox"
                  checked={e.priorityIds.includes(p.id)}
                  onChange={() => toggle('priorityIds', p.id)}
                />
                <span>
                  P-{i + 1}: {p.text}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <CapabilityPicker
          legend="Core Capabilities"
          value={e.coreCapabilities}
          onChange={(v) => set('coreCapabilities', v)}
        />
        {(actions.data?.actions.length ?? 0) > 0 && (
          <fieldset className="program-capabilities">
            <legend className="field__label">Corrective actions it will verify</legend>
            <div className="program-capabilities__list">
              {actions
                .data!.actions.filter(
                  (v) =>
                    v.action.status !== 'cancelled' || e.correctiveActionIds.includes(v.action.id),
                )
                .map((v) => (
                  <label key={v.action.id} className="row">
                    <input
                      type="checkbox"
                      checked={e.correctiveActionIds.includes(v.action.id)}
                      onChange={() => toggle('correctiveActionIds', v.action.id)}
                    />
                    <span>
                      {actionLabel(v.action)}: {v.action.title}
                    </span>
                  </label>
                ))}
            </div>
          </fieldset>
        )}
        <Field
          label="Scenario"
          hint="Link the scenario built for this exercise. It then shows as completed once it has been run."
        >
          {({ id, describedBy }) => (
            <select
              id={id}
              className="select"
              aria-describedby={describedBy}
              value={linked}
              onChange={(ev) => {
                const [projectId, scenarioId] = ev.target.value.split('|')
                setE((cur) => {
                  const { projectId: _p, scenarioId: _s, ...rest } = cur
                  return projectId && scenarioId ? { ...rest, projectId, scenarioId } : rest
                })
              }}
            >
              <option value="">Not linked</option>
              {scenarios.map((s) => (
                <option key={s.scenarioId} value={`${s.projectId}|${s.scenarioId}`}>
                  {s.project}: {s.title}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Notes">
          {({ id }) => (
            <textarea
              id={id}
              className="textarea"
              value={e.notes}
              onChange={(ev) => set('notes', ev.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}
