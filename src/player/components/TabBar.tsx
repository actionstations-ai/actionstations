import { STRINGS } from '../app/strings'

export type Tab = 'inbox' | 'feed' | 'messages' | 'more'

export interface TabSpec {
  id: Tab
  label: string
  badge?: number
  /** Shown disabled with this explanation instead of hidden, so the layout never jumps (FR-6). */
  disabledReason?: string
}

const ICONS: Record<Tab, string> = {
  inbox: 'M3 5h18v14H3zM3 12h5l2 3h4l2-3h5',
  feed: 'M4 6h16M4 12h16M4 18h10',
  messages: 'M4 5h16v10H9l-5 4z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
}

/** Bottom tab bar on phones, left rail on wide screens (CSS). Buttons, not links: no routing. */
export function TabBar({
  tabs,
  active,
  onSelect,
}: {
  tabs: TabSpec[]
  active: Tab
  onSelect: (tab: Tab) => void
}) {
  return (
    <nav className="tabbar" aria-label="Sections">
      <ul className="tabbar__list">
        {tabs.map((t) => {
          const current = t.id === active
          const badge = t.badge && t.badge > 0 ? STRINGS.tabs.unread(t.badge) : undefined
          return (
            <li key={t.id} className="tabbar__item">
              <button
                type="button"
                className={`tabbar__btn${current ? ' is-active' : ''}`}
                aria-current={current ? 'page' : undefined}
                aria-disabled={t.disabledReason ? 'true' : undefined}
                aria-describedby={t.disabledReason ? `tab-${t.id}-why` : undefined}
                onClick={() => onSelect(t.id)}
              >
                <svg
                  className="tabbar__icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d={ICONS[t.id]}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="tabbar__label">{t.label}</span>
                {badge ? <span className="tabbar__badge">{badge}</span> : null}
              </button>
              {t.disabledReason ? (
                <span id={`tab-${t.id}-why`} className="sr-only">
                  {t.disabledReason}
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
