// Fetch a real past event (#1139, spec 0448 FR-8): pick one of the connectors the scenario's
// toolkits name, give the period, the area and the connector's own options, see the size, the
// archive and its terms, and only then agree. Nothing is requested before Fetch is pressed.
import { useState } from 'react'
import type { CaseFetchPlan, ConnectorInfo, ConnectorOptionInfo } from '@shared/ipc/case-data'
import { Badge, Button, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import {
  BBOX_LABELS,
  initialForm,
  sizeText,
  toQuery,
  type FetchForm,
  type OptionValue,
} from './case-fetch-form'

interface Target {
  projectPath: string
  scenarioId: string
}

function OptionField(props: {
  option: ConnectorOptionInfo
  value: OptionValue | ''
  onChange: (v: OptionValue | '') => void
}) {
  const o = props.option
  const label = o.required ? o.label : `${o.label} (optional)`
  if (o.type === 'boolean')
    return (
      <label className="row">
        <input
          type="checkbox"
          checked={props.value === true}
          onChange={(e) => props.onChange(e.target.checked)}
        />
        {o.label}
        {o.help && <span className="muted">{o.help}</span>}
      </label>
    )
  return (
    <Field label={label} hint={o.help}>
      {({ id, describedBy }) =>
        o.type === 'choice' ? (
          <select
            id={id}
            className="input"
            aria-describedby={describedBy}
            value={String(props.value)}
            onChange={(e) => props.onChange(e.target.value)}
          >
            {!o.required && <option value="">Any</option>}
            {o.required && props.value === '' && <option value="">Choose…</option>}
            {(o.choices ?? []).map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            className="input"
            inputMode={o.type === 'number' ? 'decimal' : undefined}
            aria-describedby={describedBy}
            placeholder={`For example ${String(o.example)}`}
            value={String(props.value)}
            onChange={(e) => props.onChange(e.target.value)}
          />
        )
      }
    </Field>
  )
}

function AreaFields(props: {
  connector: ConnectorInfo
  form: FetchForm
  set: (f: Partial<FetchForm>) => void
}) {
  const a = props.connector.area
  if (!a?.label && !a?.bbox) return null
  return (
    <fieldset className="stack">
      <legend>Area</legend>
      {a.help && <p className="muted">{a.help}</p>}
      {a.label && (
        <Field label={a.label === 'required' ? 'Area name' : 'Area name (optional)'}>
          {({ id }) => (
            <input
              id={id}
              className="input"
              placeholder={a.example?.label ? `For example ${a.example.label}` : undefined}
              value={props.form.areaLabel}
              onChange={(e) => props.set({ areaLabel: e.target.value })}
            />
          )}
        </Field>
      )}
      {a.bbox && (
        <div className="row row--wrap">
          {BBOX_LABELS.map((label, i) => (
            <Field key={label} label={a.bbox === 'required' ? label : `${label} (optional)`}>
              {({ id }) => (
                <input
                  id={id}
                  className="input input--short"
                  inputMode="decimal"
                  placeholder={a.example?.bbox ? String(a.example.bbox[i]) : undefined}
                  value={props.form.bbox[i]}
                  onChange={(e) => {
                    const bbox = [...props.form.bbox] as FetchForm['bbox']
                    bbox[i] = e.target.value
                    props.set({ bbox })
                  }}
                />
              )}
            </Field>
          ))}
        </div>
      )}
    </fieldset>
  )
}

function PeriodFields(props: { form: FetchForm; set: (f: Partial<FetchForm>) => void }) {
  return (
    <fieldset className="row row--wrap">
      <legend>Period (UTC)</legend>
      <Field label="Start">
        {({ id }) => (
          <input
            id={id}
            className="input"
            type="datetime-local"
            value={props.form.start}
            onChange={(e) => props.set({ start: e.target.value })}
          />
        )}
      </Field>
      <Field label="End">
        {({ id }) => (
          <input
            id={id}
            className="input"
            type="datetime-local"
            value={props.form.end}
            onChange={(e) => props.set({ end: e.target.value })}
          />
        )}
      </Field>
    </fieldset>
  )
}

/** What the fetch would bring in, from where and under what terms. Nothing is requested yet. */
function PlanSummary(props: {
  plan: CaseFetchPlan
  busy: boolean
  onFetch: () => void
  onCancel: () => void
}) {
  const p = props.plan
  return (
    <section aria-labelledby="case-plan-title" className="card stack">
      <h4 id="case-plan-title">Before anything is requested</h4>
      <ul className="stack">
        {p.estimate.items.map((i) => (
          <li key={i.datasetId}>
            {i.label}: about {sizeText(i.bytes)}
          </li>
        ))}
      </ul>
      <p>
        Total about {sizeText(p.totalBytes)} in up to {p.estimate.requests}{' '}
        {p.estimate.requests === 1 ? 'request' : 'requests'}. This scenario has{' '}
        {sizeText(p.roomBytes)} of room left.
      </p>
      <p>
        <strong>Archive:</strong> {p.source}. The app contacts only {p.hosts.join(', ')}, and sends
        the period, the area and the options above, nothing about your plans.
      </p>
      <p>
        <strong>Terms:</strong> {p.terms}
      </p>
      {p.exceedsLimit && (
        <p role="alert" className="field__error">
          This would not fit in the scenario&apos;s case data limit. Shorten the period or the area,
          or raise the limit under Settings, Case data.
        </p>
      )}
      <div className="row">
        <Button variant="primary" disabled={props.busy || p.exceedsLimit} onClick={props.onFetch}>
          Agree and fetch
        </Button>
        <Button disabled={props.busy} onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  )
}

function useFetchFlow(target: Target, connector: ConnectorInfo | undefined, onDone: () => void) {
  const [form, setForm] = useState<FetchForm | undefined>()
  const [plan, setPlan] = useState<CaseFetchPlan | undefined>()
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const run = async (step: () => Promise<void>) => {
    setBusy(true)
    try {
      await step()
    } catch (e) {
      setErrors([errorText(e)])
    } finally {
      setBusy(false)
    }
  }
  const check = () => {
    if (!connector || !form) return
    const { query, errors: problems } = toQuery(connector, form)
    setErrors(problems)
    if (problems.length) return
    void run(async () =>
      setPlan(await call('case:plan-fetch', { ...target, connectorId: connector.id, query })),
    )
  }
  const fetch = () => {
    if (!plan) return
    void run(async () => {
      await call('case:fetch', { ...target, estimateId: plan.estimateId, consent: true })
      toast.success(`Fetched from ${plan.source}.`)
      setPlan(undefined)
      onDone()
    })
  }
  return { form, setForm, plan, setPlan, errors, setErrors, busy, check, fetch }
}

export function CaseFetch(props: Target & { connectors: ConnectorInfo[]; onDone: () => void }) {
  const [connectorId, setConnectorId] = useState('')
  const connector = props.connectors.find((c) => c.id === connectorId)
  const target = { projectPath: props.projectPath, scenarioId: props.scenarioId }
  const flow = useFetchFlow(target, connector, props.onDone)
  const choose = (id: string) => {
    const c = props.connectors.find((x) => x.id === id)
    setConnectorId(id)
    flow.setForm(c ? initialForm(c) : undefined)
    flow.setPlan(undefined)
    flow.setErrors([])
  }
  const set = (f: Partial<FetchForm>) => {
    flow.setForm((old) => (old ? { ...old, ...f } : old))
    flow.setPlan(undefined)
  }
  return (
    <section aria-labelledby="case-fetch-title" className="stack">
      <h3 id="case-fetch-title">Fetch a real past event</h3>
      <Field label="Source" hint="The archives this scenario's toolkits can read.">
        {({ id, describedBy }) => (
          <select
            id={id}
            className="input"
            aria-describedby={describedBy}
            value={connectorId}
            onChange={(e) => choose(e.target.value)}
          >
            <option value="">Choose a source…</option>
            {props.connectors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      {connector && flow.form && (
        <div className="stack">
          <p className="muted">
            <Badge tone="info">Historical</Badge> {connector.source}
          </p>
          <PeriodFields form={flow.form} set={set} />
          <AreaFields connector={connector} form={flow.form} set={set} />
          {(connector.options ?? []).map((o) => (
            <OptionField
              key={o.key}
              option={o}
              value={flow.form!.options[o.key] ?? ''}
              onChange={(v) => set({ options: { ...flow.form!.options, [o.key]: v } })}
            />
          ))}
          {flow.errors.length > 0 && (
            <ul role="alert" className="field__error">
              {flow.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {!flow.plan && (
            <div className="row">
              <Button disabled={flow.busy} onClick={flow.check}>
                Check size and terms
              </Button>
            </div>
          )}
          {flow.plan && (
            <PlanSummary
              plan={flow.plan}
              busy={flow.busy}
              onFetch={flow.fetch}
              onCancel={() => flow.setPlan(undefined)}
            />
          )}
        </div>
      )}
    </section>
  )
}
