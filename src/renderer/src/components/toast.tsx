import { X } from 'lucide-react'
import { clsx } from 'clsx'
import { Link } from 'react-router'
import { useToasts, type Toast } from './toast-store'

function ToastItem({ t, onDismiss }: { t: Toast; onDismiss: () => void }) {
  return (
    <div className={clsx('toast', `toast--${t.tone}`)}>
      <div className="toast__body">
        <strong>{t.title}</strong>
        {t.body && <p className="muted">{t.body}</p>}
        {t.action && (
          <Link className="toast__action" to={t.action.to} onClick={onDismiss}>
            {t.action.label}
          </Link>
        )}
      </div>
      <button
        type="button"
        className="btn btn--ghost btn--sm btn--icon"
        aria-label={`Dismiss notification: ${t.title}`}
        onClick={onDismiss}
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  )
}

/**
 * Two live regions that always exist (content added to a fresh region is often not read):
 * errors are announced assertively, everything else politely. Hovering or focusing the
 * stack holds auto-dismiss so nobody loses a message they are reading.
 */
export function Toaster() {
  const { toasts, dismiss, hold } = useToasts()
  const errors = toasts.filter((t) => t.tone === 'error')
  const others = toasts.filter((t) => t.tone !== 'error')
  return (
    <section
      className="toasts"
      aria-label="Notifications"
      onMouseEnter={() => hold(true)}
      onMouseLeave={() => hold(false)}
      onFocus={() => hold(true)}
      onBlur={() => hold(false)}
    >
      <div className="toasts__region" role="alert" aria-relevant="additions">
        {errors.map((t) => (
          <ToastItem key={t.id} t={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
      <div className="toasts__region" role="status" aria-live="polite" aria-relevant="additions">
        {others.map((t) => (
          <ToastItem key={t.id} t={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </section>
  )
}
