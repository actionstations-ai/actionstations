// App chrome: skip link, sidebar navigation (collapses behind a Menu button on narrow windows
// and at high zoom), and route-change handling (document title + focus to the new page's
// heading so keyboard and screen-reader users land on the content).
import { ChevronRight, Menu, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { matchPath, NavLink, useLocation } from 'react-router'
import { allRoutes } from '../routes'
import type { RouteDef } from '../routes/types'
import { useIpcQuery } from '../lib/query'
import { projectKey, useProjectUi } from '../state/project'
import { NAV_ICONS } from './nav-icons'
import { focusTarget, shouldMoveFocus, whenHeading } from '../lib/focus'
import logoUrl from '../assets/action-stations-logo.png'
import { JobsTray } from './JobsTray'

const APP_NAME = 'Action Stations'

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
  const projectNav = nav.filter((r) => r.nav?.scope === 'project')
  return (
    <>
      {nav.filter((r) => r.nav?.scope === 'global').map(link)}
      {projectPath && (
        <>
          <div
            className="sidebar__section"
            id="nav-project-heading"
            title={`${projectName}\n${projectPath}`}
          >
            {projectName}
          </div>
          <div className="sidebar__group" role="group" aria-labelledby="nav-project-heading">
            <span className="sidebar__subhead" id="nav-build-heading">
              Build
            </span>
            <div className="sidebar__group" role="group" aria-labelledby="nav-build-heading">
              {projectNav.filter((r) => r.nav?.group !== 'advanced').map(link)}
            </div>
            <AdvancedNav routes={projectNav.filter((r) => r.nav?.group === 'advanced')}>
              {link}
            </AdvancedNav>
          </div>
        </>
      )}
    </>
  )
}

const ADVANCED_KEY = 'ttx.nav.advancedOpen'

function readAdvancedOpen(): boolean {
  try {
    return localStorage.getItem(ADVANCED_KEY) === '1'
  } catch {
    return false
  }
}

function saveAdvancedOpen(open: boolean): void {
  try {
    localStorage.setItem(ADVANCED_KEY, open ? '1' : '0')
  } catch {
    // Remembering the group is a convenience; ignore storage failures.
  }
}

/** Power-user pages in a collapsible group that remembers whether it was open (#230). */
function AdvancedNav(props: { routes: RouteDef[]; children: (r: RouteDef) => ReactNode }) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(readAdvancedOpen)
  // Never hide the page the user is on: an advanced route keeps the group open.
  const onAdvancedPage = props.routes.some(
    (r) => !!matchPath({ path: r.path, end: true }, pathname),
  )
  const expanded = open || onAdvancedPage
  if (!props.routes.length) return null
  const toggle = () => {
    const next = !expanded
    setOpen(next)
    saveAdvancedOpen(next)
  }
  return (
    <>
      <button
        type="button"
        className="sidebar__disclosure"
        aria-expanded={expanded}
        aria-controls="nav-advanced"
        disabled={onAdvancedPage}
        onClick={toggle}
      >
        <ChevronRight size={14} aria-hidden className="sidebar__chevron" />
        Advanced
      </button>
      <div
        id="nav-advanced"
        className="sidebar__group"
        role="group"
        aria-label="Advanced"
        hidden={!expanded}
      >
        {props.routes.map(props.children)}
      </div>
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
          <img className="sidebar__logo" src={logoUrl} alt={APP_NAME} />
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
      <JobsTray />
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
