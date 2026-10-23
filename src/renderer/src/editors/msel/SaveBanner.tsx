// Save status of the MSEL editor: the polite status line text and the CONFLICT / error banner.
import { Button } from '../../components/ui'
import type { EditorState } from './editor-state'

const STATUS_TEXT: Record<EditorState['status'], string> = {
  idle: '',
  pending: 'Unsaved changes…',
  saving: 'Saving…',
  saved: 'All changes saved',
  conflict: 'Waiting for generation to finish',
  error: 'Not saved',
}

export function SaveBanner(props: { state: EditorState; onRetry: () => void }) {
  const { status, error } = props.state
  if (status !== 'conflict' && status !== 'error') return null
  return (
    <div className="msel-editor__banner" role="alert">
      <span>
        {status === 'conflict'
          ? 'Generation is running for this scenario. Your edits are kept here and will be saved when it finishes.'
          : `Could not save: ${error ?? 'unknown error'}. Your edits are kept here.`}
      </span>
      <Button size="sm" onClick={props.onRetry}>
        Retry now
      </Button>
    </div>
  )
}

/** The polite save status line next to the toolbar. */
export function SaveStatus({ status }: { status: EditorState['status'] }) {
  return (
    <span className="msel-editor__status muted" role="status" aria-live="polite">
      {STATUS_TEXT[status]}
    </span>
  )
}
