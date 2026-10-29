// "Copies of the EEG packet" (#421): one blank packet per evaluator seat, each labelled
// "Evaluator 1", "Evaluator 2" and so on, to print for evaluators who work on paper.
import { useId, useState } from 'react'

export const MAX_EVALUATOR_COPIES = 20

export function EvaluatorCopiesOption(props: {
  value: number
  onChange: (copies: number) => void
  disabled: boolean
}) {
  const id = useId()
  // The field may be empty while typing; the copy count is always a whole number from 1 to 20.
  const [text, setText] = useState(String(props.value))
  return (
    <div className="export-target export-option">
      <span className="export-target__text">
        <label className="export-target__label" htmlFor={id}>
          Copies of the evaluation guides
        </label>
        <span id={`${id}-hint`} className="export-target__hint">
          One blank packet per evaluator, labelled Evaluator 1, Evaluator 2 and so on. Up to{' '}
          {MAX_EVALUATOR_COPIES}.
        </span>
      </span>
      <input
        id={id}
        type="number"
        className="input"
        min={1}
        max={MAX_EVALUATOR_COPIES}
        step={1}
        inputMode="numeric"
        value={text}
        disabled={props.disabled}
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          setText(e.target.value)
          const n = Math.trunc(Number(e.target.value))
          if (e.target.value !== '' && Number.isFinite(n))
            props.onChange(Math.min(MAX_EVALUATOR_COPIES, Math.max(1, n)))
        }}
        onBlur={() => setText(String(props.value))}
      />
    </div>
  )
}
