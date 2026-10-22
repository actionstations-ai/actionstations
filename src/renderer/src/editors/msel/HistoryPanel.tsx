// Scenario snapshots with restore and a preview of how each differs from the current MSEL
// (scenarios:history-get). If the preview cannot load, the panel stays restore-only.
import { useState } from 'react'
import type { MselRow } from '@shared/schemas/scenario'
import { describeSnapshot } from './cell-format'
import { Badge, Button, Dialog } from '../../components/ui'
import { call } from '../../lib/api'
import { useIpcQuery } from '../../lib/query'
import { errorText } from '../../lib/errors'

interface Props {
  open: boolean
  projectPath: string
  scenarioId: string
  current: MselRow[]
  dirty: boolean
  onClose: () => void
  onRestored: () => Promise<void>
}

type Preview = { entryId: string; text: string }

const fmt = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

export function HistoryPanel(props: Props) {
  const req = {
    projectPath: props.projectPath,
    scenarioId: props.scenarioId,
    artifact: 'scenario' as const,
  }
  const history = useIpcQuery('scenarios:history', req, { enabled: props.open })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [canPreview, setCanPreview] = useState(true)

  const restore = async (entryId: string) => {
    setBusy(entryId)
    setError(null)
    try {
      await call('scenarios:history-restore', { ...req, entryId })
      await props.onRestored()
      props.onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const showPreview = async (entryId: string) => {
    try {
      const res = await call('scenarios:history-get', { ...req, entryId })
      setPreview({
        entryId,
        text: res.scenario
          ? describeSnapshot(res.scenario.msel, props.current)
          : 'No scenario in this snapshot.',
      })
    } catch {
      setCanPreview(false)
    }
  }

  const entries = [...(history.data ?? [])].reverse()
  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => !o && props.onClose()}
      title="Scenario history"
      description={
        props.dirty
          ? 'Restoring replaces the scenario, including edits not saved yet.'
          : 'Every save keeps a snapshot. Restoring one replaces the current scenario.'
      }
      footer={<Button onClick={props.onClose}>Close</Button>}
    >
      {history.isError && (
        <p className="field__error" role="alert">
          Could not load history: {errorText(history.error)}
        </p>
      )}
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      {!entries.length && history.data && <p className="muted">No snapshots yet.</p>}
      <ul className="msel-editor__history" aria-label="Snapshots">
        {entries.map((h) => (
          <li key={h.id} className="msel-editor__history-item">
            <div>
              <span>{fmt(h.at)}</span>{' '}
              <Badge tone={h.by === 'ai' ? 'info' : 'neutral'}>
                {h.by === 'ai' ? 'AI' : 'You'}
              </Badge>
              {h.note && <span className="muted"> · {h.note}</span>}
              {preview?.entryId === h.id && (
                <p className="muted msel-editor__history-preview">{preview.text}</p>
              )}
            </div>
            <div className="row">
              {canPreview && (
                <Button size="sm" variant="ghost" onClick={() => void showPreview(h.id)}>
                  Preview
                </Button>
              )}
              <Button
                size="sm"
                disabled={!!busy}
                onClick={() => void restore(h.id)}
                aria-label={`Restore snapshot from ${fmt(h.at)}`}
              >
                {busy === h.id ? 'Restoring…' : 'Restore'}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
