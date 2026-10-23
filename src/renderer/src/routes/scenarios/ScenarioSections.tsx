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

export function WarningsSection(props: {
  projectPath: string
  scenarioId: string
  onGoToRow?: (rowId: string) => void
}) {
  const { projectPath, scenarioId } = props
  const lint = useIpcQuery('scenarios:lint', { projectPath, scenarioId })
  if (lint.isError)
    return (
      <p className="field__error" role="alert">
        Could not check this scenario: {errorText(lint.error)}
      </p>
    )
  if (!lint.data) return <p className="muted">Checking…</p>
  const intro = (
    <p className="muted warnings__intro">
      Automatic checks (<Term id="lint">lint</Term>) on the timeline and injects. &ldquo;Must
      fix&rdquo; items are problems players would notice; the others are suggestions. None of them
      block saving or export.
    </p>
  )
  if (!lint.data.length)
    return (
      <>
        {intro}
        <p className="muted">No warnings. The scenario passes every check.</p>
      </>
    )
  const sorted = [...lint.data].sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
  return (
    <>
      {intro}
      <ul className="stack warnings" aria-label="Warnings">
        {sorted.map((w, i) => (
          <WarningItem
            key={i}
            w={w}
            projectPath={projectPath}
            scenarioId={scenarioId}
            {...(props.onGoToRow ? { onGoToRow: props.onGoToRow } : {})}
          />
        ))}
      </ul>
    </>
  )
}
