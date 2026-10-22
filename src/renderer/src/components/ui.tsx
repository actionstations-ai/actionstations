// Small presentational primitives. Styling lives in styles/components.css and uses tokens only.
import { clsx } from 'clsx'
import { Dialog as RDialog } from 'radix-ui'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useId, useLayoutEffect, useRef } from 'react'
import { PURPOSE_TAG_INFO, type PurposeTag } from '@shared/taxonomy'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'danger' | 'ghost'
  size?: 'md' | 'sm'
  icon?: boolean
}

export function Button({
  variant = 'default',
  size = 'md',
  icon,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        'btn',
        variant !== 'default' && `btn--${variant}`,
        size === 'sm' && 'btn--sm',
        icon && 'btn--icon',
        className,
      )}
      {...rest}
    />
  )
}

export function PageHeader(props: {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        {props.eyebrow && <span className="page-header__eyebrow">{props.eyebrow}</span>}
        <h1>{props.title}</h1>
        {props.description && <p className="page-header__desc">{props.description}</p>}
      </div>
      {props.actions && <div className="page-header__actions">{props.actions}</div>}
    </header>
  )
}

export function EmptyState(props: { title: string; body?: ReactNode; actions?: ReactNode }) {
  return (
    <section className="empty" aria-label={props.title}>
      <p className="empty__title">{props.title}</p>
      {props.body && <p className="empty__body">{props.body}</p>}
      {props.actions && <div className="row">{props.actions}</div>}
    </section>
  )
}

/** Label + control + hint/error, wired with ids for screen readers. */
export function Field(props: {
  label: string
  hint?: ReactNode
  error?: string
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
}) {
  const id = useId()
  const hintId = props.hint ? `${id}-hint` : undefined
  const errId = props.error ? `${id}-err` : undefined
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {props.label}
      </label>
      {props.children({ id, ...(describedBy ? { describedBy } : {}), invalid: !!props.error })}
      {props.hint && (
        <span id={hintId} className="field__hint">
          {props.hint}
        </span>
      )}
      {props.error && (
        <span id={errId} className="field__error" role="alert">
          {props.error}
        </span>
      )}
    </div>
  )
}

export function TagChip({ tag }: { tag: PurposeTag }) {
  const info = PURPOSE_TAG_INFO[tag]
  return (
    <span className={clsx('tag', `tag--${tag}`)} title={info?.meaning}>
      {info?.label ?? tag}
    </span>
  )
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'ok' | 'warn' | 'error' | 'info'
  children: ReactNode
}) {
  return <span className={clsx('badge', tone !== 'neutral' && `badge--${tone}`)}>{children}</span>
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="progress__bar" style={{ width: `${pct}%` }} />
    </div>
  )
}

/**
 * Where focus was when a dialog opened. Our dialogs are controlled (no Radix Trigger), and
 * Radix returns focus to its trigger ref on close, which is empty; without this, focus fell
 * to <body> after every dialog (WCAG 2.4.3).
 */
function useReturnFocus(open: boolean) {
  const opener = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (open) opener.current = document.activeElement as HTMLElement | null
  }, [open])
  return (e: Event) => {
    const el = opener.current
    if (!el || !el.isConnected || el === document.body) return
    e.preventDefault()
    el.focus()
  }
}

export function Dialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const returnFocus = useReturnFocus(props.open)
  return (
    <RDialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="dialog-overlay" />
        <RDialog.Content className="dialog" onCloseAutoFocus={returnFocus}>
          <RDialog.Title asChild>
            <h2>{props.title}</h2>
          </RDialog.Title>
          {props.description ? (
            <RDialog.Description className="muted">{props.description}</RDialog.Description>
          ) : (
            <RDialog.Description className="sr-only">{props.title}</RDialog.Description>
          )}
          {props.children}
          {props.footer && <div className="dialog__footer">{props.footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}
