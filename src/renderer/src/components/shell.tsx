// App chrome: skip link, sidebar navigation (collapses behind a Menu button on narrow windows
// and at high zoom), and route-change handling (document title + focus to the new page's
// heading so keyboard and screen-reader users land on the content).
import { Menu, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'
import { allRoutes } from '../routes'
import { useIpcQuery } from '../lib/query'
import { projectKey, useProjectUi } from '../state/project'
import { NAV_ICONS } from './nav-icons'
import { focusTarget, shouldMoveFocus, whenHeading } from '../lib/focus'

const APP_NAME = 'Tabletop Generator'

export function SkipLink() {
  return (
    <a className="skip-link" href="#main" onClick={focusMain}>
      Skip to main content
    </a>
  )
}

/** Hash routing owns the URL fragment, so the skip link moves focus itself. */
function focusMain(e: React.MouseEvent) {
  e.preventDefault()
  const main = document.getElementById('main')
  const heading = main?.querySelector<HTMLElement>('h1')
  focusTarget(heading ?? main)
}

function NavLinks({ onNavigate }: { onNavigate: () => void }) {
  const projectPath = useProjectUi((s) => s.projectPath)
  const project = useIpcQuery(
    'project:get',
    { path: projectPath ?? '' },
    { enabled: !!projectPath },
  )
  const nav = allRoutes.filter((r) => r.nav)
  const link = (r: (typeof nav)[number]) => {
    const Icon = r.nav?.icon ? NAV_ICONS[r.nav.icon] : undefined
    const to = projectPath ? r.path.replace(':projectKey', projectKey(projectPath)) : r.path
    return (
      <NavLink key={r.path} to={to} className="nav-link" end onClick={onNavigate}>
        {Icon && <Icon size={16} aria-hidden />}
        {r.nav?.label}
      </NavLink>
    )
  }
  const projectName = project.data?.project.name ?? 'Project'
  return (
    <>
      {nav.filter((r) => r.nav?.scope === 'global').map(link)}
      {projectPath && (
        <>
          <div className="sidebar__section" id="nav-project-heading" title={projectPath}>
            {projectName}
          </div>
          <div className="sidebar__group" role="group" aria-labelledby="nav-project-heading">
            {nav.filter((r) => r.nav?.scope === 'project').map(link)}
          </div>
        </>
      )}
    </>
  )
}

export function Sidebar() {
  const [open, setOpen] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  const close = (returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) toggle.current?.focus()
  }
  return (
    <header className="sidebar" data-open={open || undefined}>
      <div className="sidebar__top">
        <div className="sidebar__brand">
          {APP_NAME}
          <small>Exercise design studio</small>
        </div>
        <button
          ref={toggle}
          type="button"
          className="btn btn--ghost sidebar__toggle"
          aria-expanded={open}
          aria-controls="main-nav"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={16} aria-hidden /> : <Menu size={16} aria-hidden />}
          Menu
        </button>
      </div>
      <nav
        id="main-nav"
        className="sidebar__nav"
        aria-label="Main"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) close(true)
        }}
      >
        <NavLinks onNavigate={() => close(false)} />
      </nav>
    </header>
  )
}

/**
 * On every route change: title the window after the page heading (WCAG 2.4.2) and, when the
 * change came from in-app navigation (not the first load), move focus to that heading so the
 * user lands on the new content instead of staying on the link they activated.
 */
export function RouteFocus() {
  const { pathname } = useLocation()
  const first = useRef(true)
  useEffect(() => {
    const initial = first.current
    first.current = false
    if (pathname.startsWith('/present/')) return
    return whenHeading((h) => {
      const text = h?.textContent?.trim()
      document.title = text ? `${text} · ${APP_NAME}` : APP_NAME
      if (!initial && h && shouldMoveFocus(document.activeElement)) focusTarget(h)
    })
  }, [pathname])
  return null
}

/** The presentation window renders without app chrome. */
export function ChromeFor({ chrome, bare }: { chrome: ReactNode; bare: ReactNode }) {
  const { pathname } = useLocation()
  return <>{pathname.startsWith('/present/') ? bare : chrome}</>
}
