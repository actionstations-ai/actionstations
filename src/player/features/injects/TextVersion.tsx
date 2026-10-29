import { STRINGS } from '../../app/strings'

/**
 * The exact text of the inject, collapsed until opened. It is plain text in a wrapping block,
 * never HTML, and the image names it as its description (`aria-describedby`).
 */
export function TextVersion({ id, text }: { id: string; text: string }) {
  return (
    <details className="inject__text">
      <summary>{STRINGS.inject.textVersion}</summary>
      <div id={id} className="inject__text-body">
        {text}
      </div>
    </details>
  )
}
