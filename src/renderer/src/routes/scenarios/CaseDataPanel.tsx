// The scenario's Case data tab (#1139, spec 0448 FR-7..FR-10): the datasets the scenario carries,
// each labeled historical or simulated with its source; fetching a real past event from the
// archives its toolkits name; and the case clock (where the data stands at the start of the
// exercise and how fast it runs).
import { useState } from 'react'
import type { CaseDataset, CaseTimeMapping } from '@shared/schemas/case-data'
import type { Scenario } from '@shared/schemas'
import { Badge, Button, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { queryClient, useIpcQuery } from '../../lib/query'
import { CaseFetch } from './CaseFetch'
import { CaseSimulate } from './CaseSimulate'
import { sizeText } from './case-fetch-form'
import './case-data.css'

interface Target {
  projectPath: string
  scenarioId: string
}

const day = (iso: string | undefined) => (iso ? iso.slice(0, 10) : '')

function DatasetRow(props: { d: CaseDataset; busy: boolean; onRemove: () => void }) {
  const { d } = props
  const p = d.provenance
  return (
    <tr>
      <td>
        <strong>{d.label}</strong>
        {d.range && (
          <div className="muted">
            {day(d.range.start)} to {day(d.range.end)}
          </div>
        )}
      </td>
      <td>
        <Badge tone={p.origin === 'historical' ? 'info' : 'warn'}>
          {p.origin === 'historical' ? 'Historical' : 'Simulated'}
        </Badge>
      </td>
      <td>
        {p.source}
        {p.retrieved && <div className="muted">Retrieved {day(p.retrieved)}</div>}
        {p.modified && <div className="muted">{p.modified}</div>}
      </td>
      <td>{sizeText(d.bytes)}</td>
      <td>
        <Button size="sm" variant="danger" disabled={props.busy} onClick={props.onRemove}>
          Remove<span className="sr-only"> {d.label}</span>
        </Button>
      </td>
    </tr>
  )
}

function Datasets(props: Target & { datasets: CaseDataset[]; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  if (!props.datasets.length)
    return (
      <p className="muted">
        This scenario has no case data yet. Fetch a real past event below, or work without it: case
        data is optional.
      </p>
    )
  const remove = async (d: CaseDataset) => {
    if (!window.confirm(`Remove "${d.label}" from this scenario? Injects that show it will stop.`))
      return
    setBusy(true)
    try {
      await call('case:remove-dataset', {
        projectPath: props.projectPath,
        scenarioId: props.scenarioId,
        datasetId: d.id,
      })
      props.onChange()
    } catch (e) {
      toast.error('Could not remove the dataset', e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <table className="table">
      <caption className="sr-only">Case data in this scenario</caption>
      <thead>
        <tr>
          <th scope="col">Dataset</th>
          <th scope="col">Kind</th>
          <th scope="col">Source</th>
          <th scope="col">Size</th>
          <th scope="col">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {props.datasets.map((d) => (
          <DatasetRow key={d.id} d={d} busy={busy} onRemove={() => void remove(d)} />
        ))}
      </tbody>
    </table>
  )
}

function clockForm(m: CaseTimeMapping | undefined, datasets: CaseDataset[]) {
  const first = datasets
    .map((d) => d.range?.start)
    .filter((x): x is string => !!x)
    .sort()[0]
  return {
    caseStart: (m?.caseStart ?? first ?? '').slice(0, 16),
    offset: String(m?.startOffsetMin ?? 0),
    speed: String(m?.speed ?? 1),
  }
}

function CaseClock(
  props: Target & { mapping?: CaseTimeMapping; datasets: CaseDataset[]; onChange: () => void },
) {
  const [form, setForm] = useState(() => clockForm(props.mapping, props.datasets))
  const [error, setError] = useState('')
  const save = async () => {
    const offset = Number(form.offset)
    const speed = Number(form.speed)
    if (!form.caseStart) return setError('Give the case start.')
    if (!Number.isFinite(offset) || offset < 0) return setError('The offset is minutes, 0 or more.')
    if (!Number.isFinite(speed) || speed <= 0) return setError('The speed is a number above 0.')
    setError('')
    try {
      await call('case:time-mapping-save', {
        projectPath: props.projectPath,
        scenarioId: props.scenarioId,
        timeMapping: {
          caseStart: `${form.caseStart}:00Z`,
          startOffsetMin: offset,
          speed,
          jumps: props.mapping?.jumps ?? [],
        },
      })
      toast.success('Case clock saved.')
      props.onChange()
    } catch (e) {
      setError(errorText(e))
    }
  }
  const input =
    (key: keyof typeof form, type = 'text') =>
    ({ id }: { id: string }) => (
      <input
        id={id}
        className="input"
        type={type}
        inputMode={type === 'text' ? 'decimal' : undefined}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    )
  return (
    <section aria-labelledby="case-clock-title" className="stack">
      <h3 id="case-clock-title">Case clock</h3>
      <p className="muted">
        Where the case data stands when the exercise starts, and how many minutes of the event pass
        in one exercise minute. Without a setting, 0:00 of the exercise is the start of the data.
      </p>
      <div className="row row--wrap">
        <Field label="Case start (UTC)">{input('caseStart', 'datetime-local')}</Field>
        <Field label="Start offset (minutes)">{input('offset')}</Field>
        <Field label="Speed">{input('speed')}</Field>
        <Button onClick={() => void save()}>Save case clock</Button>
      </div>
      {error && (
        <p role="alert" className="field__error">
          {error}
        </p>
      )}
    </section>
  )
}

/**
 * The connectors the scenario's enabled toolkits name, and the simulations they offer (each
 * simulation names its toolkits), in the registry's order.
 */
function useScenarioSources(projectPath: string, scenarioId: string) {
  const kits = useIpcQuery('toolkits:list', { projectPath, scenarioId })
  const all = useIpcQuery('case:connectors', undefined)
  const gens = useIpcQuery('case:generators', undefined)
  const on = (kits.data?.toolkits ?? []).filter((l) => l.enabled)
  const named = new Set(on.flatMap((l) => l.toolkit.connectors))
  const onIds = new Set(on.map((l) => l.toolkit.id))
  const generators = gens.data ?? []
  return {
    loading: kits.isLoading || all.isLoading || gens.isLoading,
    connectors: (all.data ?? []).filter((c) => named.has(c.id)),
    generators,
    offered: generators.filter((g) => g.toolkits.some((t) => onIds.has(t))),
  }
}

export function CaseDataPanel(props: { projectPath: string; scenario: Scenario }) {
  const target = { projectPath: props.projectPath, scenarioId: props.scenario.id }
  const summary = useIpcQuery('case:get', target)
  const sources = useScenarioSources(target.projectPath, target.scenarioId)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['case:get'] })
  if (summary.isLoading || sources.loading) return <p role="status">Loading case data…</p>
  const manifest = summary.data?.manifest
  const datasets = manifest?.datasets ?? []
  return (
    <div className="case-data stack">
      <p className="muted">
        Case data is what a scenario carries about an event: readings over time, areas, products and
        reports. Injects can show it at the matching moment of the exercise.
        {summary.data &&
          ` This scenario holds ${sizeText(summary.data.bytes)} of ${sizeText(summary.data.limitBytes)}.`}
      </p>
      <Datasets {...target} datasets={datasets} onChange={refresh} />
      {sources.connectors.length ? (
        <CaseFetch {...target} connectors={sources.connectors} onDone={refresh} />
      ) : (
        <p className="muted">
          None of this scenario&apos;s toolkits can fetch a real past event. Turn on a toolkit that
          names a source under Toolkits.
        </p>
      )}
      <CaseSimulate
        {...target}
        offered={sources.offered}
        all={sources.generators}
        onDone={refresh}
      />
      {datasets.length > 0 && (
        <CaseClock
          key={JSON.stringify(manifest?.timeMapping ?? null)}
          {...target}
          {...(manifest?.timeMapping ? { mapping: manifest.timeMapping } : {})}
          datasets={datasets}
          onChange={refresh}
        />
      )}
    </div>
  )
}
