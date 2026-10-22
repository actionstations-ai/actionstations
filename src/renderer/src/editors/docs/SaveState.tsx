import { Button } from '../../components/ui'
import type { SaveStatus } from './use-guarded-save'

const LABEL: Record<SaveStatus, string> = {
  idle: 'All changes saved',
  saving: 'Saving…',
  saved: 'All changes saved',
  blocked: 'Waiting to save',
  error: 'Not saved',
}

/** Dirty indicator + save state, announced politely to screen readers. */
export function SaveState(props: { status: SaveStatus; dirty: boolean }) {
  const text =
    props.dirty && props.status !== 'saving' && props.status !== 'blocked'
      ? 'Unsaved changes'
      : LABEL[props.status]
  return (
    <span
      className="save-state"
      data-state={props.dirty ? 'dirty' : props.status}
      role="status"
      aria-live="polite"
    >
      <span className="save-state__dot" aria-hidden />
      {text}
    </span>
  )
}

/** Non-destructive notice while a generation job owns the scenario, or after a failed save. */
export function SaveProblem(props: {
  status: SaveStatus
  error: string | null
  onRetry: () => void
}) {
  if (props.status === 'blocked') {
    return (
      <div className="editor-banner editor-banner--warn" role="alert">
        <span>
          Generation is running for this scenario. Your edits are kept here and will be saved
          automatically when it finishes.
        </span>
        <Button size="sm" onClick={props.onRetry}>
          Retry now
        </Button>
      </div>
    )
  }
  if (props.status === 'error') {
    return (
      <div className="editor-banner editor-banner--error" role="alert">
        <span>Could not save: {props.error}</span>
        <Button size="sm" onClick={props.onRetry}>
          Retry
        </Button>
      </div>
    )
  }
  return null
}
