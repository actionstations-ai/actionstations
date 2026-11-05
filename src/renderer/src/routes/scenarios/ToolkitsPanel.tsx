// The scenario's Toolkits tab (spec 0448 FR-2): which toolkits of field expertise are on for
// this scenario, what each one adds, and the toolkits the app proposes for the brief. Nothing
// is switched on until the person says so.
import { useState } from 'react'
import type { ListedToolkit } from '@shared/ipc/toolkits'
import type { Scenario } from '@shared/schemas'
import { Badge, Button } from '../../components/ui'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { additions } from './toolkit-additions'

function Additions({ toolkit }: { toolkit: ListedToolkit['toolkit'] }) {
  const rows = additions(toolkit)
  if (!rows.length) return <p className="muted">This toolkit adds nothing yet.</p>
  return (
    <details>
      <summary>What {toolkit.name} adds</summary>
      <dl className="stack">
        {rows.map((r) => (
          <div key={r.label}>
            <dt>{r.label}</dt>
            <dd>{r.items.join(', ')}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

function Suggestions(props: {
  items: ListedToolkit[]
  busy: boolean
  onAdd: (id: string) => void
  onDismiss: (id: string) => void
}) {
  if (!props.items.length) return null
  return (
    <section aria-labelledby="toolkit-suggestions" className="stack">
      <h3 id="toolkit-suggestions">Suggested for this scenario</h3>
      <ul className="stack">
        {props.items.map((l) => (
          <li key={l.toolkit.id} className="row">
            <span>
              <strong>{l.toolkit.name}</strong>: {l.suggestion}
            </span>
            <Button size="sm" disabled={props.busy} onClick={() => props.onAdd(l.toolkit.id)}>
              Add<span className="sr-only"> {l.toolkit.name}</span>
            </Button>
            <Button size="sm" onClick={() => props.onDismiss(l.toolkit.id)}>
              Not now<span className="sr-only"> for {l.toolkit.name}</span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ToolkitsPanel(props: { projectPath: string; scenario: Scenario }) {
  const { projectPath, scenario } = props
  const q = useIpcQuery('toolkits:list', { projectPath, scenarioId: scenario.id })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const all = q.data?.toolkits ?? []
  const on = all.filter((l) => l.enabled).map((l) => l.toolkit.id)

  const change = async (next: string[], said: string) => {
    setError('')
    setBusy(true)
    try {
      await call('toolkits:set-scenario', { projectPath, scenarioId: scenario.id, toolkits: next })
      await q.refetch()
      setNotice(said)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const toggle = (l: ListedToolkit, checked: boolean) =>
    change(
      checked ? [...on, l.toolkit.id] : on.filter((id) => id !== l.toolkit.id),
      `${l.toolkit.name} is ${checked ? 'on' : 'off'}.`,
    )
  const proposed = all.filter(
    (l) => !l.enabled && l.suggestion && !dismissed.includes(l.toolkit.id),
  )

  if (q.isLoading) return <p role="status">Loading toolkits…</p>
  if (!all.length)
    return (
      <p className="muted">
        No toolkits are installed. Toolkits come in packs; add one from Packs to give the generator
        a field's terms, products and outside parties.
      </p>
    )
  return (
    <div className="stack">
      <p className="muted">
        A toolkit gives the generator one field's expertise: its terms, product formats, outside
        parties and inject types. Turn on the ones this scenario needs.
      </p>
      <Suggestions
        items={proposed}
        busy={busy}
        onAdd={(id) => {
          const l = all.find((x) => x.toolkit.id === id)!
          void change([...on, id], `${l.toolkit.name} is on.`)
        }}
        onDismiss={(id) => setDismissed((d) => [...d, id])}
      />
      <fieldset className="stack">
        <legend>Toolkits for this scenario</legend>
        {all.map((l) => {
          const t = l.toolkit
          return (
            <div key={t.id} className="stack">
              <label className="row">
                <input
                  type="checkbox"
                  checked={l.enabled}
                  disabled={busy}
                  aria-describedby={`toolkit-${t.id}-desc`}
                  onChange={(e) => void toggle(l, e.target.checked)}
                />
                <strong>{t.name}</strong>
                <Badge tone="neutral">{l.source.packName}</Badge>
              </label>
              <p id={`toolkit-${t.id}-desc`} className="muted">
                {t.description}
              </p>
              <Additions toolkit={t} />
            </div>
          )
        })}
      </fieldset>
      <p role="status" className="sr-only">
        {notice}
      </p>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
