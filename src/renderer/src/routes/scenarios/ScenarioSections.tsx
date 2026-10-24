// Read-only tab bodies for the scenario screen. The editable tabs live in editors/docs.
import { Link } from 'react-router'
import type { LintWarning } from '@shared/schemas/scenario'
import { Term } from '../../components/Glossary'
import { Badge, Button } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { errorText } from '../../lib/errors'
import { plainLintMessage, SEVERITY_LABEL } from '@shared/lint-messages'
import { injectUrl } from '../../editors/inject/links'

const SEVERITY_TONE = { info: 'neutral', warning: 'warn', error: 'error' } as const
const ORDER = { error: 0, warning: 1, info: 2 } as const

function WarningItem(props: {
  w: LintWarning
  projectPath: string
  scenarioId: string
  onGoToRow?: (rowId: string) => void
}) {
  const { w } = props
  const plain = plainLintMessage(w)
  return (
    <li className="warning">
      <Badge tone={SEVERITY_TONE[w.severity]}>{SEVERITY_LABEL[w.severity]}</Badge>
      <div className="warning__body">
        <p className="warning__plain">{plain}</p>
        <p className="warning__detail muted">
          {plain !== w.message && <span>{w.message}. </span>}
          {w.suggestion && <span>Suggestion: {w.suggestion} </span>}
          <code className="warning__code" title={`Check code ${w.code}`}>
            {w.code}
          </code>
        </p>
      </div>
      <div className="warning__actions">
        {w.rowId && props.onGoToRow && (
          <Button
            size="sm"
            onClick={() => props.onGoToRow!(w.rowId!)}
            aria-label={`Go to row ${w.rowId}`}
          >
            Go to row {w.rowId}
          </Button>
        )}
        {!w.rowId && w.injectId && (
          <Link
            className="btn btn--sm"
            to={injectUrl(props.projectPath, props.scenarioId, w.injectId)}
          >
            Open inject
          </Link>
        )}
      </div>
    </li>
  )
}

interface ListProps {
  projectPath: string
  scenarioId: string
  onGoToRow?: (rowId: string) => void
}

function WarningList(props: ListProps & { items: LintWarning[]; label: string }) {
  const sorted = [...props.items].sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
  return (
    <ul className="stack warnings" aria-label={props.label}>
      {sorted.map((w, i) => (
        <WarningItem
          key={i}
          w={w}
          projectPath={props.projectPath}
          scenarioId={props.scenarioId}
          {...(props.onGoToRow ? { onGoToRow: props.onGoToRow } : {})}
        />
      ))}
    </ul>
  )
}

/** Live and stale notes of the review pass (critique) stored with the scenario (#342). */
function splitReviewNotes(warnings: LintWarning[]): {
  live: LintWarning[]
  stale: LintWarning[]
} {
  const notes = warnings.filter((w) => w.source === 'critique')
  return { live: notes.filter((w) => !w.stale), stale: notes.filter((w) => w.stale) }
}

/**
 * The review pass's notes: live ones listed, stale ones (their row or inject changed after the
 * review, so they may quote text that is gone) folded away under a count.
 */
function ReviewNotes(props: ListProps & { notes: LintWarning[] }) {
  const { live, stale } = splitReviewNotes(props.notes)
  if (!live.length && !stale.length) return null
  return (
    <section className="review-notes" aria-label="Review notes">
      <h3 className="review-notes__title">Review notes</h3>
      <p className="muted warnings__intro">
        What the review pass flagged when it read the scenario.
      </p>
      {live.length ? (
        <WarningList {...props} items={live} label="Open review notes" />
      ) : (
        <p className="muted">No open review notes.</p>
      )}
      {stale.length > 0 && (
        <details className="review-notes__stale">
          <summary>
            {stale.length} older {stale.length === 1 ? 'note' : 'notes'} on rows changed since the
            review
          </summary>
          <p className="muted warnings__intro">
            The row or its inject was edited after the review ran, so these notes may quote text
            that is no longer there.
          </p>
          <WarningList {...props} items={stale} label="Stale review notes" />
        </details>
      )}
    </section>
  )
}

export function WarningsSection(
  props: ListProps & {
    /** The scenario's stored warnings; the review notes among them are listed apart. */
    stored?: LintWarning[]
  },
) {
  const { projectPath, scenarioId } = props
  const lint = useIpcQuery('scenarios:lint', { projectPath, scenarioId })
  if (lint.isError)
    return (
      <p className="field__error" role="alert">
        Could not check this scenario: {errorText(lint.error)}
      </p>
    )
  if (!lint.data) return <p className="muted">Checking…</p>
  const list: ListProps = {
    projectPath,
    scenarioId,
    ...(props.onGoToRow ? { onGoToRow: props.onGoToRow } : {}),
  }
  return (
    <>
      <p className="muted warnings__intro">
        Automatic checks (<Term id="lint">lint</Term>) on the timeline and injects. &ldquo;Must
        fix&rdquo; items are problems players would notice; the others are suggestions. None of them
        block saving or export.
      </p>
      {lint.data.length ? (
        <WarningList {...list} items={lint.data} label="Warnings" />
      ) : (
        <p className="muted">No warnings. The scenario passes every check.</p>
      )}
      <ReviewNotes {...list} notes={props.stored ?? []} />
    </>
  )
}
