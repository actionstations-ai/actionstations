// Field metrics on the Evaluation tab (spec 0448 FR-12): each stored result with the inputs it
// used, the numbers, its tables and the caveats that limit them. Read-only.
import type { MetricResult } from '@shared/schemas/metrics'

function MetricCard({ result }: { result: MetricResult }) {
  return (
    <section className="fac-metric" aria-label={result.title}>
      <h3>{result.title}</h3>
      <p className="muted">Inputs used</p>
      <ul>
        {result.inputs.map((i) => (
          <li key={i.label}>
            {i.label}: {i.value}
          </li>
        ))}
      </ul>
      <table className="table">
        <caption className="sr-only">{result.title} results</caption>
        <thead>
          <tr>
            <th scope="col">Measure</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {result.summary.map((m) => (
            <tr key={m.label}>
              <th scope="row">{m.label}</th>
              <td>{m.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {result.tables
        .filter((t) => t.rows.length > 0)
        .map((t) => (
          <table className="table" key={t.title}>
            <caption>{t.title}</caption>
            <thead>
              <tr>
                {t.columns.map((c) => (
                  <th scope="col" key={c}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      {result.caveats.map((c) => (
        <p className="muted" key={c}>
          {c}
        </p>
      ))}
    </section>
  )
}

export function FieldMetrics({ results }: { results: readonly MetricResult[] }) {
  if (results.length === 0) return null
  return (
    <div className="fac-metrics">
      <h2>Field metrics</h2>
      {results.map((r) => (
        <MetricCard key={`${r.metricId}:${r.sessionId ?? ''}`} result={r} />
      ))}
    </div>
  )
}
