// Frame shared by every wizard step: a heading that takes focus when the step opens (so
// screen readers announce it and Tab starts inside the step) and a Back / Continue footer.
import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from '../../components/ui'

export interface StepNav {
  onBack?: () => void
  onNext: () => void
}

export function StepLayout(props: {
  title: string
  intro?: ReactNode
  children?: ReactNode
  onBack?: () => void
  onNext: () => void
  nextLabel?: string
  nextDisabled?: boolean
  busy?: boolean
  /** Extra footer action, e.g. "Skip this step". */
  secondary?: ReactNode
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  return (
    <section className="wizard-step stack" aria-labelledby="wizard-step-title">
      <div className="stack wizard-step__head">
        <h2 id="wizard-step-title" ref={heading} tabIndex={-1}>
          {props.title}
        </h2>
        {props.intro && <div className="wizard-step__intro">{props.intro}</div>}
      </div>
      {props.children}
      <div className="wizard-step__footer">
        {props.onBack ? <Button onClick={props.onBack}>Back</Button> : <span />}
        <div className="row">
          {props.secondary}
          <Button
            variant="primary"
            onClick={props.onNext}
            disabled={props.nextDisabled || props.busy}
          >
            {props.busy ? 'Saving…' : (props.nextLabel ?? 'Continue')}
          </Button>
        </div>
      </div>
    </section>
  )
}

/** One-line result of a Test / Check button, announced politely. */
export function TestResult(props: { ok: boolean; children: ReactNode }) {
  return (
    <p
      role="status"
      className={
        props.ok ? 'wizard-result wizard-result--ok' : 'wizard-result wizard-result--error'
      }
    >
      {props.children}
    </p>
  )
}
