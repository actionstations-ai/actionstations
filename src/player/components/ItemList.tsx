import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'
import type { Item } from '../app/items'
import { ItemCard, type ItemCardProps } from './ItemCard'

/** Lists at or above this many items are windowed (ADR-0017); shorter ones mount every card. */
export const WINDOW_AT = 150

/**
 * The inbox or feed list. Long lists are windowed so 500 items scroll as smoothly as 5: the
 * scroll container is the list itself (header and tab bar stay put), rows measure themselves
 * because cards vary in height, and the list stays a plain `ul` for assistive technology.
 */
export function ItemList({
  items,
  read,
  label,
  ...cardProps
}: {
  items: Item[]
  read: ReadonlySet<string>
  label: string
} & Omit<ItemCardProps, 'item' | 'unread'>) {
  const parentRef = useRef<HTMLDivElement>(null)
  const windowed = items.length >= WINDOW_AT
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    enabled: windowed,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 132,
    overscan: 6,
    getItemKey: (i) => items[i]!.key,
  })
  const card = (item: Item) => <ItemCard item={item} unread={!read.has(item.key)} {...cardProps} />
  if (!windowed) {
    return (
      <div ref={parentRef} className="list" data-testid="item-list">
        <ul className="list__plain" aria-label={label}>
          {items.map((item) => (
            <li key={item.key} className="list__row list__row--plain">
              {card(item)}
            </li>
          ))}
        </ul>
      </div>
    )
  }
  const rows = virtualizer.getVirtualItems()
  return (
    <div ref={parentRef} className="list" data-testid="item-list" data-windowed="true">
      <ul className="list__inner" aria-label={label} style={{ height: virtualizer.getTotalSize() }}>
        {rows.map((row) => (
          <li
            key={row.key}
            ref={virtualizer.measureElement}
            data-index={row.index}
            className="list__row"
            style={{ transform: `translateY(${row.start}px)` }}
          >
            {card(items[row.index]!)}
          </li>
        ))}
      </ul>
    </div>
  )
}
