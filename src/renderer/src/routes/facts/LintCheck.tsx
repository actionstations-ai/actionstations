// "Check scenarios": how many scenario rows name identifiers the facts do not have, before
// and after an edit (#155). Runs on load (the baseline) and after every save or reset.
import { Link } from 'react-router'
import { Button } from '../../components/ui'
import { LiveStatus } from '../../components/LiveStatus'
import { describeCount, type FacilityLintState } from './use-facility-lint'

export function LintCheck(props: {
  lint: FacilityLintState & { run: () => Promise<void> }
  scenariosLink: string
  dirty: boolean
}) {
  const { lint } = props
  const summary = lint.running
    ? 'Checking scenarios…'
    : lint.error
      ? `Could not check the scenarios: ${lint.error}`
      : lint.latest
        ? describeCount(lint.baseline, lint.latest)
        : ''
  return (
    <section className="card facts-lint" aria-labelledby="facts-lint-heading">
      <div className="facts-lint__text">
        <h2 id="facts-lint-heading">Scenario check</h2>
        <p className={lint.error ? 'field__error' : undefined}>{summary}</p>
        {props.dirty && (
          <p className="muted">Save first: the check reads the saved facility-facts.md.</p>
        )}
        {!!lint.latest?.flagged.length && (
          <ul className="facts-lint__list">
            {lint.latest.flagged.map((s) => (
              <li key={s.id}>
                <Link to={`${props.scenariosLink}/${s.id}`}>{s.title}</Link>{' '}
                <span className="muted">
                  {s.warnings} {s.warnings === 1 ? 'warning' : 'warnings'} (Warnings tab)
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button onClick={() => void lint.run()} disabled={lint.running}>
        Check scenarios
      </Button>
      <LiveStatus text={summary} />
    </section>
  )
}
