import type { Item } from '../app/items'
import { STRINGS } from '../app/strings'

export interface ItemCardProps {
  item: Item
  unread: boolean
  onRead?: (key: string) => void
  onDismiss?: (key: string) => void
  /** Open the More tab an announcement points to (disabled until that feature lands). */
  onOpenTab?: (tab: NonNullable<Item['tab']>) => void
  /** Open an inject's detail (media, text version, receipts). */
  onOpen?: (key: string) => void
  /** A seat or team name for a `role:` or `team:` destination, when the page knows one. */
  nameFor?: (to: string) => string | undefined
}

function destinationLabel(to: string, nameFor?: ItemCardProps['nameFor']): string {
  if (to === 'all') return STRINGS.item.toAll
  const named = nameFor?.(to)
  if (named) return named
  const i = to.indexOf(':')
  return i === -1 ? to : to.slice(i + 1)
}

/**
 * The generic card for an inbox or feed item: exact text, never HTML. #412 replaces the inject
 * variant with media and receipts; this one stays the fallback for every text item.
 */
export function ItemCard({
  item,
  unread,
  onRead,
  onDismiss,
  onOpenTab,
  onOpen,
  nameFor,
}: ItemCardProps) {
  const headingId = `item-${item.key.replace(/[^A-Za-z0-9_-]/g, '_')}`
  const level = item.level ?? 'info'
  const classes = [
    'card',
    `card--${item.kind}`,
    item.level ? `card--${level}` : '',
    unread ? 'is-unread' : '',
  ]
  return (
    <article className={classes.filter(Boolean).join(' ')} aria-labelledby={headingId}>
      <header className="card__head">
        <span className="card__time">
          <span className="sr-only">{STRINGS.item.exerciseTime} </span>
          {item.exerciseTime}
        </span>
        <h2 id={headingId} className="card__title">
          {unread ? <span className="card__dot" aria-hidden="true" /> : null}
          {item.title}
          {unread ? <span className="sr-only"> ({STRINGS.inbox.unreadMarker})</span> : null}
        </h2>
      </header>
      {item.body ? <p className="card__body">{item.body}</p> : null}
      {item.altText && !item.inject ? (
        <p className="card__alt">
          <span className="card__meta-label">{STRINGS.item.altText}: </span>
          {item.altText}
        </p>
      ) : null}
      {item.attachments && !item.inject ? (
        <p className="card__meta">{STRINGS.item.attachments(item.attachments)}</p>
      ) : null}
      {item.kind === 'inject' ? (
        <p className="card__meta">
          {item.sender ? (
            <>
              <span className="card__meta-label">{STRINGS.item.from}: </span>
              {item.sender}
              {' · '}
            </>
          ) : null}
          <span className="card__meta-label">{STRINGS.item.to}: </span>
          {destinationLabel(item.to, nameFor)}
        </p>
      ) : null}
      <div className="card__actions">
        {item.inject && onOpen ? (
          <button
            type="button"
            className="btn btn--small btn--primary"
            aria-label={STRINGS.inject.openLabel(item.title)}
            onClick={() => onOpen(item.key)}
          >
            {STRINGS.inject.open}
          </button>
        ) : null}
        {unread && onRead && !item.inject ? (
          <button type="button" className="btn btn--small" onClick={() => onRead(item.key)}>
            {STRINGS.inbox.markRead}
          </button>
        ) : null}
        {item.tab && onOpenTab ? (
          <button
            type="button"
            className="btn btn--small"
            aria-disabled="true"
            onClick={() => onOpenTab(item.tab!)}
          >
            {STRINGS.feed.opensLater}
          </button>
        ) : null}
        {item.dismissible && onDismiss ? (
          <button
            type="button"
            className="btn btn--small btn--quiet"
            onClick={() => onDismiss(item.key)}
          >
            {STRINGS.feed.dismiss}
          </button>
        ) : null}
      </div>
    </article>
  )
}
