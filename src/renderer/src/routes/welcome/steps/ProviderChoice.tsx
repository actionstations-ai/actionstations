// Pick which configured provider writes the exercise, choose its model and test it.
import { useState } from 'react'
import { Badge, Button } from '../../../components/ui'
import { call } from '../../../lib/api'
import { useIpcQuery } from '../../../lib/query'
import { KIND_LABELS } from '../../providers/catalog'
import { TestResult } from '../StepLayout'
import { formatLatency, type ProviderViewT, type TextChoice } from '../wizard-state'

type TestOutcome = Awaited<ReturnType<typeof call<'providers:test'>>>

function ModelPicker(props: {
  provider: ProviderViewT
  value: string
  onChange: (m: string) => void
}) {
  const models = useIpcQuery('providers:models', { id: props.provider.id })
  const chat = (models.data ?? []).filter((m) => m.kind === 'chat' || m.kind === 'unknown')
  const ids = chat.map((m) => m.id)
  if (props.value && !ids.includes(props.value)) ids.unshift(props.value)
  return (
    <label className="field">
      <span className="field__label">Model</span>
      {ids.length > 0 ? (
        <select
          className="select"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
        >
          {!props.value && <option value="">Provider default</option>}
          {ids.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="input mono"
          value={props.value}
          placeholder="Provider default"
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
    </label>
  )
}

function TestButton({ choice }: { choice: TextChoice }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<TestOutcome | null>(null)
  const test = async () => {
    setBusy(true)
    setResult(null)
    try {
      setResult(
        await call('providers:test', {
          id: choice.providerId,
          ...(choice.model ? { model: choice.model } : {}),
        }),
      )
    } catch (err) {
      setResult({
        ok: false,
        latencyMs: 0,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="stack wizard-test">
      <div className="row">
        <Button onClick={() => void test()} disabled={busy}>
          {busy ? 'Testing…' : 'Test'}
        </Button>
        <span className="muted">Sends one short prompt and shows the reply.</span>
      </div>
      {result && (
        <TestResult ok={result.ok}>
          {result.ok
            ? `Replied “${result.sample ?? ''}” in ${formatLatency(result.latencyMs)}`
            : `Failed: ${result.error ?? 'no reply'}`}
        </TestResult>
      )}
    </div>
  )
}

export function ProviderChoice(props: {
  providers: ProviderViewT[]
  choice: TextChoice | null
  onChange: (c: TextChoice) => void
}) {
  const selected = props.providers.find((p) => p.id === props.choice?.providerId)
  return (
    <div className="card stack">
      <h3 id="text-choice-heading">Use for writing</h3>
      <div role="radiogroup" aria-labelledby="text-choice-heading" className="wizard-radios">
        {props.providers.map((p) => (
          <label key={p.id} className="wizard-radio">
            <input
              type="radio"
              name="text-provider"
              checked={p.id === props.choice?.providerId}
              onChange={() => props.onChange({ providerId: p.id, model: p.defaultModel ?? '' })}
            />
            <span>
              {p.label} <Badge>{KIND_LABELS[p.kind]}</Badge>
            </span>
          </label>
        ))}
      </div>
      {selected && props.choice && (
        <>
          <ModelPicker
            key={selected.id}
            provider={selected}
            value={props.choice.model}
            onChange={(model) => props.onChange({ providerId: selected.id, model })}
          />
          <TestButton key={`${selected.id}:${props.choice.model}`} choice={props.choice} />
        </>
      )}
      <p className="muted">
        Used for ideation, drafting and critique. Change per task later in Providers.
      </p>
    </div>
  )
}
