import { clsx } from 'clsx'
import { forwardRef, useImperativeHandle, useRef, type KeyboardEvent } from 'react'
import { insertIndent, offsetOfLine } from './prompt-utils'

export interface CodeTextareaHandle {
  /** Move the caret to the start of a 1-based line and focus the editor. */
  goToLine: (line: number) => void
}

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  onSave: () => void
  errorLines: ReadonlySet<number>
  describedBy?: string
}

/** Monospace textarea with a line-number gutter. Tab inserts two spaces; Cmd/Ctrl+S saves. */
export const CodeTextarea = forwardRef<CodeTextareaHandle, Props>(
  function CodeTextarea(props, ref) {
    const area = useRef<HTMLTextAreaElement>(null)
    const gutter = useRef<HTMLDivElement>(null)
    const lineCount = props.value.split('\n').length

    useImperativeHandle(ref, () => ({
      goToLine: (line) => {
        const el = area.current
        if (!el) return
        const offset = offsetOfLine(el.value, line)
        el.focus()
        el.setSelectionRange(offset, offset)
      },
    }))

    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        props.onSave()
        return
      }
      if (e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        const el = e.currentTarget
        const next = insertIndent(el.value, el.selectionStart, el.selectionEnd)
        props.onChange(next.value)
        requestAnimationFrame(() => area.current?.setSelectionRange(next.caret, next.caret))
      }
    }

    return (
      <div className="code-editor">
        <div className="code-editor__gutter mono" ref={gutter} aria-hidden>
          {Array.from({ length: lineCount }, (_, i) => (
            <span key={i} className={clsx(props.errorLines.has(i + 1) && 'is-error')}>
              {i + 1}
            </span>
          ))}
        </div>
        <textarea
          ref={area}
          className="code-editor__area mono"
          aria-label={props.label}
          aria-describedby={props.describedBy}
          aria-invalid={props.errorLines.size > 0 || undefined}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onScroll={(e) => {
            if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop
          }}
        />
      </div>
    )
  },
)
