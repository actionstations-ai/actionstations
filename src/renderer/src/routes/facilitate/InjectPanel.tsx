import { Monitor, Printer, Volume2 } from 'lucide-react'
import { mediaUrl } from '@shared/media-url'
import { Badge, Button } from '../../components/ui'
import {
  DELIVERY_LABEL,
  deliveryAction,
  imageAsset,
  screenAsset,
  type DeliveryAction,
} from './delivery'
import type { TimelineEntry } from './Timeline'

export interface InjectPanelProps {
  projectPath: string
  entry: TimelineEntry
  note: string
  onNote: (text: string) => void
  onDeliver: () => void
  onUndo: () => void
  onShow: () => void
}

function DeliveryHint({ action, target }: { action: DeliveryAction; target: string }) {
  switch (action.kind) {
    case 'present':
      return (
        <p className="fac-hint">
          <Monitor size={16} aria-hidden /> Deliver shows this on the main screen.
        </p>
      )
    case 'play':
      return (
        <p className="fac-hint">
          <Volume2 size={16} aria-hidden /> Deliver plays the audio on the presentation screen.
        </p>
      )
    case 'hand':
      return (
        <p className="fac-hint fac-hint--strong">
          <Printer size={16} aria-hidden /> Print / hand to {target}
        </p>
      )
    case 'read':
      return <p className="fac-hint">Read aloud to the room.</p>
    case 'none':
      return <p className="fac-hint muted">No media rendered for this inject yet.</p>
  }
}

function Preview({ projectPath, entry }: { projectPath: string; entry: TimelineEntry }) {
  const image = imageAsset(entry.inject)
  const audio = entry.inject?.assets.find((a) => a.kind === 'audio')
  return (
    <>
      {image && (
        <img
          className="fac-panel__preview"
          src={mediaUrl(projectPath, image.path)}
          alt={`Inject page for ${entry.row.id}`}
        />
      )}
      {audio && (
        <audio
          className="fac-panel__audio"
          controls
          preload="none"
          src={mediaUrl(projectPath, audio.path)}
          aria-label={`Audio for ${entry.row.id} (preview on this computer)`}
        />
      )}
    </>
  )
}

export function InjectPanel(p: InjectPanelProps) {
  const { row, inject } = p.entry
  const action = deliveryAction(inject)
  const noteId = `fac-note-${row.id}`
  return (
    <article className="fac-panel" aria-label={`Inject ${row.id}`}>
      <header className="fac-panel__head">
        <span className="mono">
          {row.time} · {row.id}
        </span>
        {inject && <Badge tone="info">{DELIVERY_LABEL[inject.deliveryMode]}</Badge>}
        {p.entry.deliveredAt && <Badge tone="ok">Delivered {p.entry.deliveredAt}</Badge>}
      </header>
      <h2 className="fac-panel__title">{inject?.title || row.event}</h2>
      <p className="muted">
        {row.from} → {p.entry.target}
      </p>
      <DeliveryHint action={action} target={p.entry.target} />
      <div className="row">
        {p.entry.deliveredAt ? (
          <Button key="undo" onClick={p.onUndo}>
            Undo deliver
          </Button>
        ) : (
          <Button key="deliver" variant="primary" onClick={p.onDeliver} aria-keyshortcuts="D">
            Deliver
          </Button>
        )}
        <Button onClick={p.onShow} disabled={!screenAsset(inject)}>
          <Monitor size={16} aria-hidden /> Show on screen
        </Button>
      </div>
      <Preview projectPath={p.projectPath} entry={p.entry} />
      <dl className="fac-panel__facts">
        <dt>Event</dt>
        <dd>{row.event}</dd>
        <dt>Expected action</dt>
        <dd>{row.expectedAction || '—'}</dd>
        {inject?.instructorNote && (
          <>
            <dt>Instructor note</dt>
            <dd>{inject.instructorNote}</dd>
          </>
        )}
      </dl>
      <div className="field">
        <label className="field__label" htmlFor={noteId}>
          Hot wash notes for {row.id}
        </label>
        <textarea
          id={noteId}
          className="textarea fac-panel__note"
          rows={4}
          value={p.note}
          placeholder="What the players did, decisions, gaps…"
          onChange={(e) => p.onNote(e.target.value)}
        />
      </div>
    </article>
  )
}
