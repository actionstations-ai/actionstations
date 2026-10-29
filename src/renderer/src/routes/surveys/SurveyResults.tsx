// Results of one survey, computed in main with the anonymity threshold applied: counts per
// channel, scale means with a 1..5 distribution, choice counts, free text, before/after
// confidence and knowledge-check comparisons. Bars are plain SVG inside a real table, so the
// numbers are read out by screen readers and the bars are decoration.
import type { SurveyQuestionSummary, SurveySummary } from '@shared/schemas/survey'
import { EmptyState } from '../../components/ui'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'

const CHANNELS: Record<string, string> = {
  paper: 'paper',
  manual: 'typed in',
  live: 'live play',
  qr: 'phone',
}

const fmt = (n: number | undefined, digits = 2) =>
  n === undefined ? '—' : String(Number(n.toFixed(digits)))
const pct = (n: number | undefined) => (n === undefined ? '—' : `${Math.round(n * 100)}%`)

function Bar({ value, max }: { value: number; max: number }) {
  const width = max ? Math.round((value / max) * 100) : 0
  return (
    <svg
      className="sv-bar"
      viewBox="0 0 100 8"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <rect className="sv-bar__track" x="0" y="0" width="100" height="8" />
      <rect className="sv-bar__fill" x="0" y="0" width={width} height="8" />
    </svg>
  )
}

function ScaleResult({ q }: { q: SurveyQuestionSummary }) {
  const dist = q.distribution ?? []
  const max = Math.max(0, ...dist)
  return (
    <>
      <p>
        Mean <strong>{fmt(q.mean)}</strong> · median {fmt(q.median, 1)}
      </p>
      <table className="sv-dist">
        <caption className="sr-only">Answers per point, 1 to 5</caption>
        <tbody>
          {dist.map((count, i) => (
            <tr key={i}>
              <th scope="row">{i + 1}</th>
              <td className="sv-dist__bar">
                <Bar value={count} max={max} />
              </td>
              <td className="sv-dist__n">{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function ChoiceResult({ q }: { q: SurveyQuestionSummary }) {
  const choices = q.choices ?? []
  const max = Math.max(0, ...choices.map((c) => c.count))
  return (
    <>
      <table className="sv-dist">
        <caption className="sr-only">Answers per option</caption>
        <tbody>
          {choices.map((c) => (
            <tr key={c.optionId}>
              <th scope="row">
                {c.text}
                {c.correct && <span className="sv-correct"> (correct)</span>}
              </th>
              <td className="sv-dist__bar">
                <Bar value={c.count} max={max} />
              </td>
              <td className="sv-dist__n">
                {c.count} ({q.n ? Math.round((c.count / q.n) * 100) : 0}%)
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {q.shareCorrect !== undefined && <p>Answered correctly: {pct(q.shareCorrect)}</p>}
      {!!q.otherTexts?.length && <TextList title="Other answers" texts={q.otherTexts} />}
    </>
  )
}

function TextList({ title, texts }: { title: string; texts: string[] }) {
  return (
    <>
      <p className="sr-only">{title}, in no particular order</p>
      <ul className="sv-texts">
        {texts.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </>
  )
}

function QuestionResult({ q, number }: { q: SurveyQuestionSummary; number: number }) {
  return (
    <li className="card sv-result">
      <h3>
        {number}. {q.text}
      </h3>
      <p className="muted">
        {q.n} {q.n === 1 ? 'answer' : 'answers'}
      </p>
      {q.suppressed ? (
        <p className="muted">Hidden: too few answers to show without risking anonymity.</p>
      ) : (
        <>
          {q.distribution && <ScaleResult q={q} />}
          {q.choices && <ChoiceResult q={q} />}
          {q.texts && <TextList title="Answers" texts={q.texts} />}
        </>
      )}
    </li>
  )
}

function PairsTable({ summary }: { summary: SurveySummary }) {
  if (!summary.pairs.length) return null
  return (
    <section className="sv-compare" aria-labelledby="sv-pairs-title">
      <h3 id="sv-pairs-title">Confidence before and after</h3>
      <table className="table">
        <caption className="sr-only">Mean confidence, 1 to 5, per statement</caption>
        <thead>
          <tr>
            <th scope="col">Statement</th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {summary.pairs.map((p) => (
            <tr key={p.pairKey}>
              <td>{p.statement}</td>
              <td>
                {fmt(p.before)} <span className="muted">(n {p.nBefore})</span>
              </td>
              <td>
                {fmt(p.after)} <span className="muted">(n {p.nAfter})</span>
              </td>
              <td>{p.delta === undefined ? '—' : `${p.delta > 0 ? '+' : ''}${fmt(p.delta)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function KnowledgeTable({ summary }: { summary: SurveySummary }) {
  if (!summary.knowledge.length) return null
  const missed = [...summary.knowledge]
    .filter((k) => (k.shareAfter ?? k.shareBefore) !== undefined)
    .sort((a, b) => (a.shareAfter ?? a.shareBefore ?? 1) - (b.shareAfter ?? b.shareBefore ?? 1))
  return (
    <section className="sv-compare" aria-labelledby="sv-knowledge-title">
      <h3 id="sv-knowledge-title">Knowledge check: answered correctly</h3>
      <table className="table">
        <caption className="sr-only">Share of correct answers per item, most missed first</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
            <th scope="col">Plan section</th>
          </tr>
        </thead>
        <tbody>
          {(missed.length ? missed : summary.knowledge).map((k) => (
            <tr key={k.questionId}>
              <td>{k.text}</td>
              <td>{pct(k.shareBefore)}</td>
              <td>{pct(k.shareAfter)}</td>
              <td>
                {k.citation ? <span className="sv-cite">{k.citation.headingPath}</span> : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function Counts({ summary }: { summary: SurveySummary }) {
  const parts = Object.entries(summary.byChannel).map(([c, n]) => `${n} ${CHANNELS[c] ?? c}`)
  return (
    <p className="sv-counts" role="status">
      <strong>
        {summary.responses} {summary.responses === 1 ? 'response' : 'responses'}
      </strong>
      {parts.length > 0 && ` (${parts.join(', ')})`}
    </p>
  )
}

export function SurveyResults(props: {
  projectPath: string
  scenarioId: string
  surveyId: string
}) {
  const q = useIpcQuery('surveys:summary', props)
  if (q.isError)
    return (
      <p className="field__error" role="alert">
        Could not load the results: {errorText(q.error)}
      </p>
    )
  const summary = q.data
  if (!summary) return <p className="muted">Loading results…</p>
  if (!summary.responses)
    return (
      <EmptyState
        title="No responses yet"
        body="Print the form and type in returned copies below, or enter responses as they come in."
      />
    )
  return (
    <div className="sv-results">
      <Counts summary={summary} />
      {summary.suppressed && (
        <p className="sv-note">
          Details hidden until {summary.minResponses} responses. This keeps answers anonymous in a
          small room; the threshold is in Settings.
        </p>
      )}
      <PairsTable summary={summary} />
      <KnowledgeTable summary={summary} />
      {!summary.suppressed && (
        <ol className="sv-result-list" aria-label="Results per question">
          {summary.questions.map((question, i) => (
            <QuestionResult key={question.questionId} q={question} number={i + 1} />
          ))}
        </ol>
      )}
    </div>
  )
}
