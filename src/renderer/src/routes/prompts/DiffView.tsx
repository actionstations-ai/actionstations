import { clsx } from 'clsx'
import { useMemo } from 'react'
import { diffStats, lineDiff, type DiffKind } from './prompt-utils'

const PREFIX: Record<DiffKind, string> = { add: '+', del: '-', same: ' ' }
const SPOKEN: Record<DiffKind, string> = { add: 'added', del: 'removed', same: 'unchanged' }

/** Unified line diff, rendered as text (never as markup). */
export function DiffView(props: { before: string; after: string; baseLabel: string }) {
  const lines = useMemo(() => lineDiff(props.before, props.after), [props.before, props.after])
  const stats = diffStats(lines)
  const title = `Changes vs ${props.baseLabel}`
  return (
    <section className="prompt-diff" aria-label={title}>
      <h3 className="prompt-diff__title">
        {title}
        <span className="muted">
          {stats.added === 0 && stats.removed === 0
            ? ' — no changes'
            : ` — ${stats.added} added, ${stats.removed} removed`}
        </span>
      </h3>
      <pre className="prompt-diff__body mono">
        {lines.map((line, i) => (
          <span key={i} className={clsx('prompt-diff__line', `prompt-diff__line--${line.kind}`)}>
            <span className="sr-only">{SPOKEN[line.kind]}: </span>
            <span aria-hidden>{PREFIX[line.kind]} </span>
            {line.text}
            {'\n'}
          </span>
        ))}
      </pre>
    </section>
  )
}
