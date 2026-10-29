import { useEffect, useRef } from 'react'
import { STRINGS } from '../../app/strings'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * The original rendition full screen. A modal dialog: focus moves in, Tab stays inside, Escape
 * or Close puts focus back where it was.
 */
export function FullSizeViewer({
  url,
  alt,
  describedBy,
  onClose,
}: {
  url: string
  alt: string
  describedBy?: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const dialog = ref.current
    const before = document.activeElement as HTMLElement | null
    dialog?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose()
      if (e.key !== 'Tab' || !dialog) return
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      before?.focus?.()
    }
  }, [onClose])
  return (
    <div
      ref={ref}
      className="viewer"
      role="dialog"
      aria-modal="true"
      aria-label={STRINGS.inject.fullSizeTitle}
    >
      <button type="button" className="btn viewer__close" onClick={onClose}>
        {STRINGS.inject.closeFullSize}
      </button>
      <div className="viewer__scroll">
        <img
          className="viewer__img"
          src={url}
          alt={alt}
          {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        />
      </div>
    </div>
  )
}
