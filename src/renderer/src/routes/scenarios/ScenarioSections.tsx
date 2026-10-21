// Read-only tab bodies for the scenario screen. Editing lands in M4.
import { useState } from 'react'
import type { Scenario, ScenarioDocKind } from '@shared/schemas/scenario'
import { Badge, Button } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { CitationChips } from './CitationChips'
import { Markdown } from './Markdown'

export function OverviewSection({ scenario }: { scenario: Scenario }) {
  const o = scenario.overview
  if (!o) return <p className="muted">The overview has not been generated yet.</p>
  const item = (label: string, text: string) =>
    text ? (
      <div className="kv">
        <dt>{label}</dt>
        <dd>{text}</dd>
      </div>
    ) : null
  return (
    <div className="stack">
      <dl className="kv-list">
        {item('Location', o.location)}
        {item('Target audience', o.targetAudience)}
        {item('Theme', o.theme)}
        {item('The threat', o.threat)}
        {item('Operational impact', o.operationalImpact)}
      </dl>
      <h3 className="section-title">Core sections tested</h3>
      {o.coreSectionsTested.length ? (
        <ul className="core-sections">
          {o.coreSectionsTested.map((c, i) => (
            <li key={i}>
              <CitationChips citations={[c]} />
              {c.quote && <span className="muted">{c.quote}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No plan sections cited.</p>
      )}
    </div>
  )
}

export function ObjectivesRolesSection({ scenario }: { scenario: Scenario }) {
  return (
    <div className="two-col">
      <section aria-label="Objectives">
        <h3 className="section-title">Objectives</h3>
        {scenario.objectives.length ? (
          <ol className="stack objectives">
            {scenario.objectives.map((o) => (
              <li key={o.id}>
                {o.name && <strong>{o.name}: </strong>}
                {o.text}
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">No objectives yet.</p>
        )}
      </section>
      <section aria-label="Roles">
        <h3 className="section-title">Roles & responsibilities</h3>
        {scenario.roles.length ? (
          <ul className="stack roles">
            {scenario.roles.map((r) => (
              <li key={r.id}>
                <strong>{r.name}</strong>
                {r.abbreviation && <span className="muted"> ({r.abbreviation})</span>}
                {r.description && <span>: {r.description}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No roles yet.</p>
        )}
      </section>
    </div>
  )
}

const DOC_LABELS: Record<ScenarioDocKind, string> = {
  handbook: 'Controller handbook',
  briefing: 'Player briefing',
  hotwash: 'Hot wash guide',
  overview: 'Overview',
}
const DOC_ORDER: ScenarioDocKind[] = ['handbook', 'briefing', 'hotwash', 'overview']

export function DocumentsSection(props: { projectPath: string; scenario: Scenario }) {
  const available = DOC_ORDER.filter((k) => props.scenario.documents[k])
  const [kind, setKind] = useState<ScenarioDocKind>(available[0] ?? 'handbook')
  const doc = useIpcQuery('scenarios:doc-get', {
    projectPath: props.projectPath,
    scenarioId: props.scenario.id,
    kind,
  })
  return (
    <div className="stack">
      <div className="row" role="group" aria-label="Document">
        {DOC_ORDER.map((k) => (
          <Button
            key={k}
            size="sm"
            variant={k === kind ? 'primary' : 'default'}
            aria-pressed={k === kind}
            onClick={() => setKind(k)}
          >
            {DOC_LABELS[k]}
          </Button>
        ))}
      </div>
      {doc.isError && <p className="field__error">Could not load: {doc.error.message}</p>}
      {doc.data && !doc.data.markdown.trim() && (
        <p className="muted">The {DOC_LABELS[kind].toLowerCase()} has not been generated yet.</p>
      )}
      {doc.data?.markdown.trim() && (
        <Markdown source={doc.data.markdown} label={DOC_LABELS[kind]} />
      )}
    </div>
  )
}

export function RubricSection({ scenario }: { scenario: Scenario }) {
  const metrics = scenario.rubric?.metrics ?? []
  if (!metrics.length) return <p className="muted">The rubric has not been generated yet.</p>
  const total = metrics.reduce((n, m) => n + m.points, 0)
  return (
    <table className="table rubric" aria-label="Evaluation rubric">
      <thead>
        <tr>
          <th scope="col">Metric</th>
          <th scope="col">Points</th>
          <th scope="col">Fail</th>
          <th scope="col">Pass</th>
          <th scope="col">Excellence</th>
          <th scope="col">Linked injects</th>
        </tr>
      </thead>
      <tbody>
        {metrics.map((m) => (
          <tr key={m.id}>
            <th scope="row">{m.name}</th>
            <td className="mono">{m.points}</td>
            <td>{m.fail}</td>
            <td>{m.pass}</td>
            <td>{m.excellence}</td>
            <td className="mono">{m.linkedInjectIds.join(', ') || '—'}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">Total</th>
          <td className="mono">{total}</td>
          <td colSpan={4} />
        </tr>
      </tfoot>
    </table>
  )
}

const SEVERITY_TONE = { info: 'info', warning: 'warn', error: 'error' } as const

export function WarningsSection(props: { projectPath: string; scenarioId: string }) {
  const lint = useIpcQuery('scenarios:lint', props)
  if (lint.isError) return <p className="field__error">Lint failed: {lint.error.message}</p>
  if (!lint.data) return <p className="muted">Checking…</p>
  if (!lint.data.length) return <p className="muted">No warnings. The scenario passes lint.</p>
  return (
    <ul className="stack warnings" aria-label="Warnings">
      {lint.data.map((w, i) => (
        <li key={i} className="warning">
          <Badge tone={SEVERITY_TONE[w.severity]}>{w.severity}</Badge>
          <span className="mono muted">{w.rowId ?? w.injectId ?? w.code}</span>
          <span>
            {w.message}
            {w.suggestion && <span className="muted"> Suggestion: {w.suggestion}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}
