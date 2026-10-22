// Read-only tab bodies for the scenario screen. The editable tabs live in editors/docs.
import { Badge } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { errorText } from '../../lib/errors'

const SEVERITY_TONE = { info: 'info', warning: 'warn', error: 'error' } as const

export function WarningsSection(props: { projectPath: string; scenarioId: string }) {
  const lint = useIpcQuery('scenarios:lint', props)
  if (lint.isError)
    return (
      <p className="field__error" role="alert">
        Could not check this scenario: {errorText(lint.error)}
      </p>
    )
  if (!lint.data) return <p className="muted">Checking…</p>
  if (!lint.data.length) return <p className="muted">No warnings. The scenario passes lint.</p>
  return (
    <ul className="stack warnings" aria-label="Warnings">
      {lint.data.map((w, i) => (
        <li key={i} className="warning">
          <Badge tone={SEVERITY_TONE[w.severity]}>{w.severity}</Badge>
          <span className="mono muted">{w.rowId ?? w.injectId ?? w.code}</span>
          <span>
            {w.message}
            {w.suggestion && <span className="muted"> Suggestion: {w.suggestion}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}
