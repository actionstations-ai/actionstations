/** An empty, loading or error state: one line that says what, one that says why or what next. */
export function EmptyState({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children?: React.ReactNode
}) {
  return (
    <div className="empty" role="status">
      <p className="empty__title">{title}</p>
      {hint ? <p className="empty__hint">{hint}</p> : null}
      {children}
    </div>
  )
}
