export type BannerTone = 'info' | 'warning' | 'success'

/** A full-width line under the header for connection and catch-up states. */
export function Banner({
  tone,
  children,
  live = true,
}: {
  tone: BannerTone
  children: React.ReactNode
  live?: boolean
}) {
  return (
    <div className={`banner banner--${tone}`} role={live ? 'status' : undefined}>
      {children}
    </div>
  )
}
