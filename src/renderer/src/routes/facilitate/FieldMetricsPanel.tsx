// Field metrics controls on the Evaluation tab (spec 0448 FR-12): which metrics the scenario's
// toolkits configure, a button to compute or refresh them from the session log and the case
// data, and, for message consistency, the key facts and what each partner stated. The numbers
// themselves are shown by FieldMetrics.
import { useId, useState } from 'react'
import type { FactStatement, KeyFact } from '@shared/schemas/evaluation'
import type { MetricResult } from '@shared/schemas/metrics'
import { Button } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { queryClient, useIpcQuery } from '../../lib/query'
import { FieldMetrics } from './FieldMetrics'

interface Props {
  projectPath: string
  scenarioId: string
  results: readonly MetricResult[]
  keyFacts: readonly KeyFact[]
  statements: readonly FactStatement[]
}

const factId = (n: number): string => `fact_${n}`

function KeyFactsEditor(p: Omit<Props, 'results'>) {
  const [facts, setFacts] = useState<KeyFact[]>([...p.keyFacts])
  const [rows, setRows] = useState<FactStatement[]>([...p.statements])
  const labelId = useId()
  const req = { projectPath: p.projectPath, scenarioId: p.scenarioId }

  const save = async () => {
    try {
      const keyFacts = facts.filter((f) => f.label.trim())
      const factStatements = rows.filter((r) => r.partner.trim() && r.value.trim())
      const record = await call('evaluation:metric-inputs', { ...req, keyFacts, factStatements })
      queryClient.setQueryData(['evaluation:get', req], record)
      void queryClient.invalidateQueries({ queryKey: ['evaluation:metrics-plan'] })
      toast.success('Key facts saved')
    } catch (e) {
      toast.error('Could not save the key facts', e)
    }
  }

  return (
    <fieldset className="stack fac-metric-inputs">
      <legend>Key facts for message consistency</legend>
      <p className="muted">
        List the facts partners should agree on, then enter the value each partner stated for them.
      </p>
      {facts.map((f, i) => (
        <div className="field" key={f.id}>
          <label className="field__label" htmlFor={`${labelId}-${f.id}`}>
            Key fact {i + 1}
          </label>
          <input
            id={`${labelId}-${f.id}`}
            className="input"
            maxLength={200}
            value={f.label}
            onChange={(e) =>
              setFacts(facts.map((x) => (x.id === f.id ? { ...x, label: e.target.value } : x)))
            }
          />
        </div>
      ))}
      <div>
        <Button
          onClick={() =>
            setFacts([...facts, { id: factId(Math.max(0, ...facts.map(idNumber)) + 1), label: '' }])
          }
        >
          Add a key fact
        </Button>
      </div>
      {rows.map((r, i) => (
        <div className="row" key={i}>
          <select
            className="select"
            aria-label={`Fact for statement ${i + 1}`}
            value={r.factId}
            onChange={(e) =>
              setRows(rows.map((x, j) => (j === i ? { ...x, factId: e.target.value } : x)))
            }
          >
            {facts.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label || f.id}
              </option>
            ))}
          </select>
          <input
            className="input"
            aria-label={`Partner for statement ${i + 1}`}
            placeholder="Partner"
            maxLength={120}
            value={r.partner}
            onChange={(e) =>
              setRows(rows.map((x, j) => (j === i ? { ...x, partner: e.target.value } : x)))
            }
          />
          <input
            className="input"
            aria-label={`Stated value for statement ${i + 1}`}
            placeholder="Value stated"
            maxLength={500}
            value={r.value}
            onChange={(e) =>
              setRows(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
            }
          />
        </div>
      ))}
      <div className="row">
        <Button
          disabled={facts.length === 0}
          onClick={() => setRows([...rows, { factId: facts[0]!.id, partner: '', value: '' }])}
        >
          Add a statement
        </Button>
        <Button variant="primary" onClick={save}>
          Save key facts
        </Button>
      </div>
    </fieldset>
  )
}

const idNumber = (f: KeyFact): number => Number(/(\d+)$/.exec(f.id)?.[1] ?? 0)

export function FieldMetricsPanel(p: Props) {
  const req = { projectPath: p.projectPath, scenarioId: p.scenarioId }
  const plan = useIpcQuery('evaluation:metrics-plan', req)
  const [busy, setBusy] = useState(false)
  const [skipped, setSkipped] = useState<{ id: string; reason: string }[]>([])
  const metrics = plan.data?.metrics ?? []
  const wantsFacts = metrics.some((m) => m.id === 'message_consistency')

  const run = async () => {
    setBusy(true)
    try {
      const out = await call('evaluation:metrics-run', {
        ...req,
        ...(plan.data?.sessionId ? { sessionId: plan.data.sessionId } : {}),
      })
      queryClient.setQueryData(['evaluation:get', req], out.record)
      setSkipped(out.skipped)
      if (out.results.length) toast.success('Field metrics updated')
      else toast.info('No field metric could be computed')
    } catch (e) {
      toast.error('Could not compute the field metrics', e)
    } finally {
      setBusy(false)
    }
  }

  if (metrics.length === 0) return <FieldMetrics results={p.results} />
  return (
    <div className="stack">
      <section aria-label="Field metric settings" className="stack">
        <h2>Field metrics from toolkits</h2>
        <ul>
          {metrics.map((m) => (
            <li key={m.id}>
              {m.title} <span className="muted">({m.toolkitName})</span>
            </li>
          ))}
        </ul>
        {!plan.data?.sessionId && (
          <p className="muted">
            No live session has been run, so there are no decisions to measure yet.
          </p>
        )}
        <div>
          <Button variant="primary" disabled={busy} onClick={run}>
            {p.results.length ? 'Refresh field metrics' : 'Compute field metrics'}
          </Button>
        </div>
        {skipped.length > 0 && (
          <ul role="status">
            {skipped.map((s) => (
              <li key={s.id}>
                {s.id} was not computed: {s.reason}
              </li>
            ))}
          </ul>
        )}
      </section>
      {wantsFacts && <KeyFactsEditor {...p} />}
      <FieldMetrics results={p.results} />
    </div>
  )
}
