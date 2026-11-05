// PREP exercise settings inside Exercise details (spec 0455 FR-10, #782): the exercise type,
// objectives with results, worst case discharge, countermeasures, core components, evaluation and
// certification, with the exercise record and the core-component coverage of the cycle. The text
// is generic guidance from the PREP Guidelines, not legal advice.
import { useId, useState } from 'react'
import type { ConductDetails } from '@shared/schemas/scenario'
import {
  CORE_COMPONENTS,
  PREP_KIND_LABELS,
  PREP_PLAN_RULES,
  PREP_PLAN_TYPES,
  PREP_RESULTS,
  PrepSettings,
  defaultPlanType,
  prepObjectives,
  type CoreComponentId,
  type PrepExerciseKind,
  type PrepPlanType,
  type PrepResult,
} from '@shared/prep'
import type { PrepCoverage } from '@shared/ipc/prep'
import { call } from '../../../lib/api'
import { Button } from '../../../components/ui'
import { Empty, StringList, TextField } from './inputs'

type Update = (fn: (c: ConductDetails) => ConductDetails) => void

const RESULT_LABEL: Record<PrepResult, string> = {
  met: 'Met',
  partial: 'Partially met',
  not_met: 'Not met',
  not_evaluated: 'Not evaluated',
}

function Select<T extends string>(props: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  const id = useId()
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {props.label}
      </label>
      <select
        id={id}
        className="select"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as T)}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

const toggle = <T,>(list: readonly T[], item: T, on: boolean): T[] =>
  on ? [...list.filter((x) => x !== item), item] : list.filter((x) => x !== item)

function Check(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="conduct__check">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span>{props.label}</span>
    </label>
  )
}

function Objectives(props: {
  planType: PrepPlanType
  results: Record<string, PrepResult>
  onChange: (id: string, v: PrepResult) => void
}) {
  return (
    <fieldset className="conduct__group">
      <legend className="field__label conduct__legend">Objectives and results</legend>
      <p className="field__hint">
        Filled in from the PREP Guidelines for this plan type. Mark each one when the exercise is
        evaluated.
      </p>
      {prepObjectives(props.planType).map((o) => (
        <Select
          key={o.id}
          label={`${o.id}. ${o.text}`}
          value={props.results[o.id] ?? 'not_evaluated'}
          options={PREP_RESULTS.map((r) => ({ value: r, label: RESULT_LABEL[r] }))}
          onChange={(v) => props.onChange(o.id, v)}
        />
      ))}
    </fieldset>
  )
}

function Components(props: {
  also: readonly CoreComponentId[]
  na: readonly CoreComponentId[]
  onAlso: (id: CoreComponentId, on: boolean) => void
  onNa: (id: CoreComponentId, on: boolean) => void
}) {
  return (
    <fieldset className="conduct__group">
      <legend className="field__label conduct__legend">Core components (Appendix A)</legend>
      <p className="field__hint">
        The injects in the scenario mark the components they exercise. Tick a component here if the
        discussion covered it without an inject, or if it does not apply to the plan.
      </p>
      {CORE_COMPONENTS.map((c) => (
        <div className="part__item-grid" key={c.id}>
          <Check
            label={`${c.ref} ${c.name}: also exercised in discussion`}
            checked={props.also.includes(c.id)}
            onChange={(v) => props.onAlso(c.id, v)}
          />
          <Check
            label={`${c.ref} ${c.name}: does not apply to the plan`}
            checked={props.na.includes(c.id)}
            onChange={(v) => props.onNa(c.id, v)}
          />
        </div>
      ))}
    </fieldset>
  )
}

function Countermeasures(props: {
  plan: string[]
  exercised: string[]
  onPlan: (v: string[]) => void
  onExercised: (name: string, on: boolean) => void
}) {
  return (
    <fieldset className="conduct__group">
      <legend className="field__label conduct__legend">Countermeasures in the plan</legend>
      <StringList
        label="Dispersant, chemical agent, in-situ burn or other countermeasures the plan lists"
        itemLabel="Countermeasure"
        items={props.plan}
        onChange={props.onPlan}
      />
      {props.plan
        .filter((n) => n.trim())
        .map((n) => (
          <Check
            key={n}
            label={`${n}: exercised in this exercise`}
            checked={props.exercised.includes(n)}
            onChange={(v) => props.onExercised(n, v)}
          />
        ))}
    </fieldset>
  )
}

function Outputs(props: { projectPath: string; scenarioId: string }) {
  const [coverage, setCoverage] = useState<PrepCoverage | undefined>()
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  const run = async (fn: () => Promise<void>): Promise<void> => {
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <fieldset className="conduct__group">
      <legend className="field__label conduct__legend">Coverage and exercise record</legend>
      <p className="field__hint">Save the exercise details first: both use what is saved.</p>
      <div className="row">
        <Button
          size="sm"
          onClick={() =>
            run(async () =>
              setCoverage(
                await call('prep:coverage', {
                  projectPath: props.projectPath,
                  scenarioId: props.scenarioId,
                }),
              ),
            )
          }
        >
          Check coverage of the cycle
        </Button>
        <Button
          size="sm"
          onClick={() =>
            run(async () => {
              const r = await call('prep:record', {
                projectPath: props.projectPath,
                scenarioId: props.scenarioId,
              })
              setSaved(`Saved ${r.fileName} in the exports folder.`)
            })
          }
        >
          Create exercise record (PDF)
        </Button>
      </div>
      {saved && <p role="status">{saved}</p>}
      {error && <p role="alert">{error}</p>}
      {coverage && (
        <div role="status">
          <p>
            {coverage.cycleLine ? `${coverage.cycleLine}. ` : ''}
            {coverage.covered} of {coverage.applicable} applicable core components exercised (
            {coverage.percent}%) across {coverage.exercises.length} PREP exercise
            {coverage.exercises.length === 1 ? '' : 's'}.
          </p>
          {coverage.missing.length ? (
            <p>
              Not yet exercised:{' '}
              {coverage.missing
                .map((id) => CORE_COMPONENTS.find((c) => c.id === id)?.name ?? id)
                .join(', ')}
              .
            </p>
          ) : (
            <p>Every applicable core component has been exercised in this cycle.</p>
          )}
        </div>
      )}
    </fieldset>
  )
}

export function PrepFields(props: {
  c: ConductDetails
  update: Update
  projectPath: string
  scenarioId: string
}) {
  const { c, update } = props
  const prep = c.prep
  const setPrep = (fn: (p: PrepSettings) => PrepSettings): void =>
    update((p) => (p.prep ? { ...p, prep: fn(p.prep) } : p))
  const choose = (kind: PrepExerciseKind | 'none'): void =>
    update((p) => {
      const { prep: _drop, ...rest } = p
      return kind === 'none' ? rest : { ...rest, prep: PrepSettings.parse({ exerciseKind: kind }) }
    })
  const planType = prep ? (prep.planType ?? defaultPlanType(prep.exerciseKind)) : undefined
  return (
    <fieldset className="conduct__group">
      <legend className="field__label conduct__legend">PREP exercise (oil spill response)</legend>
      <Select
        label="PREP exercise type"
        value={prep?.exerciseKind ?? 'none'}
        options={[
          { value: 'none', label: 'Not a PREP exercise' },
          { value: 'imt_tabletop', label: PREP_KIND_LABELS.imt_tabletop },
          { value: 'area_exercise', label: PREP_KIND_LABELS.area_exercise },
        ]}
        onChange={choose}
      />
      {!prep || !planType ? (
        <Empty>
          Choose a PREP type to pre-fill the objectives, track the core components and create the
          exercise record. This is generic guidance, not legal advice: the plan holder and the
          regulator decide what satisfies the plan.
        </Empty>
      ) : (
        <>
          <Select
            label="Plan type"
            value={planType}
            options={PREP_PLAN_TYPES.map((t) => ({ value: t, label: PREP_PLAN_RULES[t].label }))}
            onChange={(t) => setPrep((p) => ({ ...p, planType: t }))}
          />
          <TextField
            label="Plan holder"
            value={prep.planHolder}
            onChange={(planHolder) => setPrep((p) => ({ ...p, planHolder }))}
          />
          <TextField
            label="First day of the plan's exercise cycle"
            type="date"
            value={prep.cycleStart ?? ''}
            hint={`The cycle is ${PREP_PLAN_RULES[planType].cycleYears} years for this plan type.`}
            onChange={(v) =>
              setPrep((p) => {
                const { cycleStart: _drop, ...rest } = p
                return v ? { ...rest, cycleStart: v } : rest
              })
            }
          />
          <Check
            label="This exercise simulates a worst case discharge scenario"
            checked={prep.worstCaseDischarge}
            onChange={(worstCaseDischarge) => setPrep((p) => ({ ...p, worstCaseDischarge }))}
          />
          {prep.worstCaseDischarge && (
            <TextField
              label="Which worst case discharge scenario"
              value={prep.worstCaseNote}
              onChange={(worstCaseNote) => setPrep((p) => ({ ...p, worstCaseNote }))}
            />
          )}
          <Countermeasures
            plan={prep.countermeasuresInPlan}
            exercised={prep.countermeasuresExercised}
            onPlan={(countermeasuresInPlan) => setPrep((p) => ({ ...p, countermeasuresInPlan }))}
            onExercised={(name, on) =>
              setPrep((p) => ({
                ...p,
                countermeasuresExercised: toggle(p.countermeasuresExercised, name, on),
              }))
            }
          />
          <Objectives
            planType={planType}
            results={prep.objectiveResults}
            onChange={(id, v) =>
              setPrep((p) => ({ ...p, objectiveResults: { ...p.objectiveResults, [id]: v } }))
            }
          />
          <Components
            also={prep.alsoExercised}
            na={prep.notApplicable}
            onAlso={(id, on) =>
              setPrep((p) => ({ ...p, alsoExercised: toggle(p.alsoExercised, id, on) }))
            }
            onNa={(id, on) =>
              setPrep((p) => ({ ...p, notApplicable: toggle(p.notApplicable, id, on) }))
            }
          />
          <TextField
            label="Evaluation"
            multiline
            rows={3}
            value={prep.evaluation}
            hint="How the objectives were judged (self-evaluation by the plan holder)."
            onChange={(evaluation) => setPrep((p) => ({ ...p, evaluation }))}
          />
          <StringList
            label="Lessons learned"
            itemLabel="Lesson"
            items={prep.lessons}
            onChange={(lessons) => setPrep((p) => ({ ...p, lessons }))}
          />
          <div className="part__item-grid">
            <TextField
              label="Certifying representative"
              value={prep.certifier.name ?? ''}
              onChange={(name) => setPrep((p) => ({ ...p, certifier: { ...p.certifier, name } }))}
            />
            <TextField
              label="Title"
              value={prep.certifier.title ?? ''}
              onChange={(title) => setPrep((p) => ({ ...p, certifier: { ...p.certifier, title } }))}
            />
            <TextField
              label="Certification date"
              value={prep.certifier.date ?? ''}
              onChange={(date) => setPrep((p) => ({ ...p, certifier: { ...p.certifier, date } }))}
            />
          </div>
          <Outputs projectPath={props.projectPath} scenarioId={props.scenarioId} />
        </>
      )}
    </fieldset>
  )
}
