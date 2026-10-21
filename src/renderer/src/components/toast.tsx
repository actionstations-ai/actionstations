import { X } from 'lucide-react'
import { clsx } from 'clsx'
import { useToasts } from './toast-store'

export function Toaster() {
  const { toasts, dismiss } = useToasts()
  return (
    <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx('toast', `toast--${t.tone}`)}
          role={t.tone === 'error' ? 'alert' : 'status'}
        >
          <div className="toast__body">
            <strong>{t.title}</strong>
            {t.body && <p className="muted">{t.body}</p>}
          </div>
          <button
            className="btn btn--ghost btn--sm btn--icon"
            aria-label="Dismiss notification"
            onClick={() => dismiss(t.id)}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}
