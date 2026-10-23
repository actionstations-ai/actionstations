import { useShallow } from 'zustand/react/shallow'
import { Button } from '../../components/ui'
import { useDraftCount } from '../inject/draft'
import { flushPendingSaves, usePendingSaves } from './pending-saves'

/**
 * "1 unsaved change pending": edits to this scenario kept after their editor was closed while
 * generation was running. They are saved when the job finishes, or when the editor reopens.
 * Also "1 inject has an unsaved draft": inject edits kept across navigation but not saved (#202).
 */
export function PendingSavesNote(props: { scenarioId: string }) {
  const labels = usePendingSaves(
    useShallow((s) =>
      Object.values(s.entries)
        .filter((e) => e.scenarioId === props.scenarioId)
        .map((e) => e.label),
    ),
  )
  const drafts = useDraftCount(props.scenarioId)
  return (
    <div role="status" aria-live="polite" className="pending-saves">
      {labels.length > 0 && (
        <span className="pending-saves__item">
          <span className="pending-saves__dot" aria-hidden />
          <span>
            <strong>
              {labels.length} unsaved change{labels.length === 1 ? '' : 's'} pending
            </strong>{' '}
            <span className="muted">
              ({labels.join(', ')}): saved automatically when generation finishes.
            </span>
          </span>
          <Button size="sm" onClick={() => void flushPendingSaves()}>
            Retry now
          </Button>
        </span>
      )}
      {drafts > 0 && (
        <span className="pending-saves__item">
          <span className="pending-saves__dot" aria-hidden />
          <span>
            <strong>
              {drafts} inject{drafts === 1 ? ' has an' : 's have'} unsaved draft
              {drafts === 1 ? '' : 's'}
            </strong>{' '}
            <span className="muted">
              (marked Draft on the Injects tab). Open the inject to save or discard. Export and
              render use the saved version.
            </span>
          </span>
        </span>
      )}
    </div>
  )
}
