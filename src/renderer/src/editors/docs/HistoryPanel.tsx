// Version history for one artifact: list of saved versions, a line diff of the selected
// version against the current text, and restore.
import { clsx } from 'clsx'
import { useState } from 'react'
import type { ScenarioDocKind } from '@shared/schemas/scenario'
import { Button, Dialog } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { lineDiff } from './line-diff'
import { errorText } from '../../lib/errors'

const SIGN = { same: ' ', add: '+', del: '−', skip: '…' } as const

function DiffView({ before, after }: { before: string; after: string }) {
  const lines = lineDiff(before, after)
  if (!lines.some((l) => l.kind === 'add' || l.kind === 'del')) {
    return <p className="muted">This version is identical to the current text.</p>
  }
  return (
    <ol className="diff" aria-label="Changes from this version to the current text">
      {lines.map((l, i) => (
        <li key={i} className={clsx('diff__line', `diff__line--${l.kind}`)}>
          <span className="diff__sign" aria-hidden>
            {SIGN[l.kind]}
          </span>
          <span className="sr-only">
            {l.kind === 'add' ? 'added: ' : l.kind === 'del' ? 'removed: ' : ''}
          </span>
          {l.text || ' '}
        </li>
      ))}
    </ol>
  )
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function HistoryPanel(props: {
  projectPath: string
  scenarioId: string
  kind: ScenarioDocKind
  current: string
  dirty: boolean
  onRestore: (entryId: string) => Promise<void>
}) {
  const ref = { projectPath: props.projectPath, scenarioId: props.scenarioId }
  const history = useIpcQuery('scenarios:history', { ...ref, artifact: props.kind })
  const [selected, setSelected] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const entry = useIpcQuery(
    'scenarios:history-get',
    { ...ref, artifact: props.kind, entryId: selected ?? 'none' },
    { enabled: !!selected },
  )
  const entries = history.data ?? []

  return (
    <section className="history" aria-label="Version history">
      <h3 className="section-title">Version history</h3>
      {history.isError && (
        <p className="field__error" role="alert">
          {errorText(history.error)}
        </p>
      )}
      {!entries.length && history.data && (
        <p className="muted">No saved versions yet. Every save keeps one.</p>
      )}
      <ul className="history__list" aria-label="Saved versions">
        {entries.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className="history__entry"
              aria-pressed={selected === e.id}
              onClick={() => setSelected(e.id)}
            >
              <span>{when(e.at)}</span>
              <span className="muted">
                {e.by === 'ai' ? 'Generated' : 'Saved'}
                {e.note ? ` · ${e.note}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="stack">
          <div className="row">
            <Button size="sm" variant="primary" onClick={() => setConfirm(true)}>
              Restore this version
            </Button>
          </div>
          {entry.isError && (
            <p className="field__error" role="alert">
              {errorText(entry.error)}
            </p>
          )}
          {entry.data?.markdown !== undefined && (
            <DiffView before={entry.data.markdown} after={props.current} />
          )}
        </div>
      )}
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Restore this version?"
        description={`The current text${props.dirty ? ', including unsaved edits,' : ''} is saved to history first, so you can switch back.`}
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirm(false)
                if (selected) void props.onRestore(selected)
              }}
            >
              Restore
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </section>
  )
}
