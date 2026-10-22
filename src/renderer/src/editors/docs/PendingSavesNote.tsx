import { useShallow } from 'zustand/react/shallow'
import { Button } from '../../components/ui'
import { flushPendingSaves, usePendingSaves } from './pending-saves'

/**
 * "1 unsaved change pending": edits to this scenario kept after their editor was closed while
 * generation was running. They are saved when the job finishes, or when the editor reopens.
 */
export function PendingSavesNote(props: { scenarioId: string }) {
  const labels = usePendingSaves(
    useShallow((s) =>
      Object.values(s.entries)
        .filter((e) => e.scenarioId === props.scenarioId)
        .map((e) => e.label),
    ),
  )
  return (
    <div role="status" aria-live="polite" className="pending-saves">
      {labels.length > 0 && (
        <>
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
        </>
      )}
    </div>
  )
}
