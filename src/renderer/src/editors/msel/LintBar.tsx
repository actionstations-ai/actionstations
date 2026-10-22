// Lint summary above the grid: counts by severity, expandable list, click to jump to a row.
import { useState } from 'react'
import type { LintWarning } from '@shared/schemas/scenario'
import { Badge, Button } from '../../components/ui'

const TONE = { info: 'info', warning: 'warn', error: 'error' } as const

export function LintBar(props: {
  warnings: LintWarning[] | undefined
  checking: boolean
  onJump: (rowId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const list = props.warnings ?? []
  const count = (s: LintWarning['severity']) => list.filter((w) => w.severity === s).length
  const summary = [
    count('error') && `${count('error')} error${count('error') > 1 ? 's' : ''}`,
    count('warning') && `${count('warning')} warning${count('warning') > 1 ? 's' : ''}`,
    count('info') && `${count('info')} info`,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <section className="msel-editor__lint" aria-label="Lint">
      <div className="row">
        <span role="status" className="msel-editor__lint-summary">
          {props.checking && !props.warnings
            ? 'Checking…'
            : summary
              ? `Lint: ${summary}`
              : 'Lint: no warnings'}
        </span>
        {list.length > 0 && (
          <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide' : 'Show'} details
          </Button>
        )}
        <span className="muted msel-editor__lint-note">Warnings never block saving.</span>
      </div>
      {open && (
        <ul className="msel-editor__lint-list">
          {list.map((w, i) => (
            <li key={i}>
              <Badge tone={TONE[w.severity]}>{w.severity}</Badge>
              {w.rowId ? (
                <button
                  type="button"
                  className="msel-editor__jump"
                  onClick={() => props.onJump(w.rowId!)}
                >
                  {w.rowId}
                </button>
              ) : (
                <span className="mono muted">{w.code}</span>
              )}
              <span>
                {w.message}
                {w.suggestion && <span className="muted"> Suggestion: {w.suggestion}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
