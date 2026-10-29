// The checklist a connection test returns (spec 0410 FR-4, NFR-3): one line per check with a text
// status (never colour alone) and a next step on a failure. The region is announced when it changes.
import type { ConnectionTestResult } from '@shared/schemas/live'
import { Button } from '../../../components/ui'
import { CONNECTION } from './strings'

const STATUS_TEXT = { pass: CONNECTION.pass, warn: CONNECTION.warn, fail: CONNECTION.fail } as const

export function TestBlock(props: {
  testing: boolean
  result: ConnectionTestResult | undefined
  error: string | undefined
  disabled?: boolean
  onTest: () => void
}) {
  return (
    <div className="live-test">
      <div className="row">
        <Button type="button" disabled={props.disabled || props.testing} onClick={props.onTest}>
          {props.testing ? CONNECTION.testing : CONNECTION.test}
        </Button>
      </div>
      <div role="status" aria-live="polite" className="live-test__results">
        {props.error && <p className="field__error">{props.error}</p>}
        {props.result && <TestResults result={props.result} />}
      </div>
    </div>
  )
}

export function TestResults({ result }: { result: ConnectionTestResult }) {
  return (
    <section aria-label={CONNECTION.testHeading}>
      <h4 className="live-note__title">{CONNECTION.testHeading}</h4>
      <ul className="live-checks">
        {result.checks.map((c) => (
          <li key={c.id} className={`live-check live-check--${c.status}`}>
            <strong>
              {STATUS_TEXT[c.status]}: {c.label}
            </strong>
            {c.detail && <span className="live-check__detail">{c.detail}</span>}
            {c.nextStep && <span className="live-check__next">{c.nextStep}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
