// Generate simulated data (#1141, spec 0448 FR-10): pick one of the simulations the scenario's
// toolkits offer, start from its example, change the inputs and run it. The datasets it writes
// are labeled simulated everywhere they appear. Nothing leaves the computer.
import { useState } from 'react'
import type { GeneratorInfo, GeneratorInput } from '@shared/ipc/case-data'
import { Badge, Button, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { toInputs, valuesFrom, type SimValue, type SimValues } from './case-simulate-form'

function hintFor(i: GeneratorInput): string | undefined {
  const range =
    i.min !== undefined && i.max !== undefined
      ? `From ${i.min} to ${i.max}.`
      : i.min !== undefined
        ? `At least ${i.min}.`
        : i.max !== undefined
          ? `At most ${i.max}.`
          : ''
  const extra =
    i.kind === 'json'
      ? 'Edited as JSON.'
      : i.kind === 'lines'
        ? 'One per line.'
        : i.kind === 'datetime'
          ? 'UTC.'
          : ''
  // The help often gives the range already ("2 to 120 days"); say it once.
  const said =
    !!i.help && [i.min, i.max].some((b) => b !== undefined && i.help!.includes(String(b)))
  return [i.help, said ? '' : range, extra].filter(Boolean).join(' ') || undefined
}

function ChoicesInput(props: {
  input: GeneratorInput
  value: string[]
  onChange: (v: string[]) => void
}) {
  const { input } = props
  return (
    <fieldset className="stack">
      <legend>{input.label}</legend>
      {input.help && <p className="muted">{input.help}</p>}
      <div className="row row--wrap">
        {(input.choices ?? []).map((c) => {
          const v = String(c.value)
          return (
            <label key={v} className="row">
              <input
                type="checkbox"
                checked={props.value.includes(v)}
                onChange={(e) =>
                  props.onChange(
                    e.target.checked ? [...props.value, v] : props.value.filter((x) => x !== v),
                  )
                }
              />
              {c.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

function SimInput(props: {
  input: GeneratorInput
  value: SimValue
  onChange: (v: SimValue) => void
}) {
  const { input: i, value } = props
  if (i.kind === 'boolean')
    return (
      <label className="row">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => props.onChange(e.target.checked)}
        />
        {i.label}
        {i.help && <span className="muted">{i.help}</span>}
      </label>
    )
  if (i.kind === 'choices')
    return (
      <ChoicesInput input={i} value={Array.isArray(value) ? value : []} onChange={props.onChange} />
    )
  const text = typeof value === 'string' ? value : ''
  return (
    <Field label={i.label} hint={hintFor(i)}>
      {({ id, describedBy }) => {
        const common = {
          id,
          'aria-describedby': describedBy,
          value: text,
        }
        if (i.kind === 'choice')
          return (
            <select className="input" {...common} onChange={(e) => props.onChange(e.target.value)}>
              {!i.required && <option value="">Not set</option>}
              {(i.choices ?? []).map((c) => (
                <option key={String(c.value)} value={String(c.value)}>
                  {c.label}
                </option>
              ))}
            </select>
          )
        if (i.kind === 'json' || i.kind === 'lines')
          return (
            <textarea
              className="input case-data__code"
              rows={Math.min(14, Math.max(3, text.split('\n').length))}
              spellCheck={false}
              {...common}
              onChange={(e) => props.onChange(e.target.value)}
            />
          )
        return (
          <input
            className="input"
            type={i.kind === 'datetime' ? 'datetime-local' : 'text'}
            inputMode={i.kind === 'number' ? 'decimal' : undefined}
            {...common}
            onChange={(e) => props.onChange(e.target.value)}
          />
        )
      }}
    </Field>
  )
}

function useSimulation(
  target: { projectPath: string; scenarioId: string },
  info: GeneratorInfo | undefined,
  onDone: () => void,
) {
  const [values, setValues] = useState<SimValues>({})
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (!info) return
    const { inputs, errors: problems } = toInputs(info, values)
    setErrors(problems)
    if (problems.length) return
    setBusy(true)
    try {
      await call('case:generate', { ...target, generatorId: info.id, params: inputs })
      toast.success('Simulated data added to the scenario.', info.label)
      onDone()
    } catch (e) {
      setErrors([errorText(e)])
    } finally {
      setBusy(false)
    }
  }
  return { values, setValues, errors, setErrors, busy, run }
}

export function CaseSimulate(props: {
  projectPath: string
  scenarioId: string
  /** The simulations of the scenario's toolkits that are on. */
  offered: GeneratorInfo[]
  /** Every simulation, for "show all". */
  all: GeneratorInfo[]
  onDone: () => void
}) {
  const [showAll, setShowAll] = useState(props.offered.length === 0)
  const [id, setId] = useState('')
  const list = showAll ? props.all : props.offered
  const info = list.find((g) => g.id === id)
  const target = { projectPath: props.projectPath, scenarioId: props.scenarioId }
  const sim = useSimulation(target, info, props.onDone)
  const choose = (next: string) => {
    const g = list.find((x) => x.id === next)
    setId(next)
    sim.setValues(g ? valuesFrom(g) : {})
    sim.setErrors([])
  }
  return (
    <section aria-labelledby="case-sim-title" className="stack">
      <h3 id="case-sim-title">Generate simulated data</h3>
      <p className="muted">
        A simulation makes data for a fictional event from the inputs you give. It runs on this
        computer, repeats exactly with the same inputs and seed, and is labeled simulated wherever
        it appears.
      </p>
      <label className="row">
        <input
          type="checkbox"
          checked={showAll}
          onChange={(e) => {
            setShowAll(e.target.checked)
            choose('')
          }}
        />
        Show simulations from every toolkit
      </label>
      <Field label="Simulation">
        {({ id: fieldId }) => (
          <select
            id={fieldId}
            className="input"
            value={id}
            onChange={(e) => choose(e.target.value)}
          >
            <option value="">Choose a simulation…</option>
            {list.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      {info && (
        <div className="stack">
          <p>
            <Badge tone="warn">Simulated</Badge> {info.description}
          </p>
          {info.inputs.map((i) => (
            <SimInput
              key={i.key}
              input={i}
              value={sim.values[i.key] ?? ''}
              onChange={(v) => sim.setValues({ ...sim.values, [i.key]: v })}
            />
          ))}
          {sim.errors.length > 0 && (
            <ul role="alert" className="field__error">
              {sim.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="row">
            <Button variant="primary" disabled={sim.busy} onClick={() => void sim.run()}>
              Run simulation
            </Button>
            <Button disabled={sim.busy} onClick={() => sim.setValues(valuesFrom(info))}>
              Start again from the example
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
