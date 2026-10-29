// Write the reply: Enter sends, Shift+Enter breaks the line (spec 0413 FR-10).
import { useId, type KeyboardEvent } from 'react'
import { Button } from '../../../components/ui'

export function MessageComposer(props: {
  value: string
  onChange: (text: string) => void
  onSend: () => void
  persona: string
  disabled: boolean
  busy: boolean
}) {
  const id = useId()
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (!props.disabled) props.onSend()
    }
  }
  return (
    <div className="fac-msg__composer">
      <label htmlFor={id} className="field__label">
        {props.persona ? `Reply as ${props.persona}` : 'Reply'}
      </label>
      <textarea
        id={id}
        className="input"
        rows={3}
        maxLength={2000}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={onKey}
      />
      <div className="row">
        <Button variant="primary" disabled={props.disabled || props.busy} onClick={props.onSend}>
          Send
        </Button>
        <span className="fac-hint">Enter sends. Shift+Enter starts a new line.</span>
      </div>
    </div>
  )
}
