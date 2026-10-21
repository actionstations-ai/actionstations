import { Suspense, useEffect } from 'react'
import { HashRouter, NavLink, Navigate, Route, Routes, useParams } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { allRoutes } from './routes'
import { queryClient, useIpcQuery } from './lib/query'
import { subscribe } from './lib/api'
import { Toaster } from './components/toast'
import { NAV_ICONS } from './components/nav-icons'
import { fromProjectKey, projectKey, useProjectUi } from './state/project'

function ThemeSync() {
  const settings = useIpcQuery('settings:get', undefined)
  const theme = settings.data?.ui.theme ?? 'system'
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
  }, [theme])
  return null
}

/** Invalidate cached IPC queries when main reports a change. */
function EventBridge() {
  useEffect(() => {
    const offs = [
      subscribe('project:changed', () => void queryClient.invalidateQueries()),
      subscribe('job:done', () => void queryClient.invalidateQueries()),
    ]
    return () => offs.forEach((off) => off())
  }, [])
  return null
}

function Sidebar() {
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
      <NavLink key={r.path} to={to} className="nav-link" end>
        {Icon && <Icon size={16} aria-hidden />}
        {r.nav?.label}
      </NavLink>
    )
  }
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="sidebar__brand">
        Tabletop Generator
        <small>Exercise design studio</small>
      </div>
      {nav.filter((r) => r.nav?.scope === 'global').map(link)}
      {projectPath && (
        <>
          <div className="sidebar__section" title={projectPath}>
            {project.data?.project.name ?? 'Project'}
          </div>
          {nav.filter((r) => r.nav?.scope === 'project').map(link)}
        </>
      )}
    </nav>
  )
}

/** Keeps the open-project store in sync with /p/:projectKey/* routes. */
function ProjectScope({ children }: { children: React.ReactNode }) {
  const { projectKey: key } = useParams()
  const setProjectPath = useProjectUi((s) => s.setProjectPath)
  useEffect(() => {
    if (key) setProjectPath(fromProjectKey(key))
  }, [key, setProjectPath])
  return <>{children}</>
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <ThemeSync />
        <EventBridge />
        <div className="shell">
          <Sidebar />
          <main className="main" id="main">
            <Suspense fallback={<div className="page muted">Loading…</div>}>
              <Routes>
                <Route path="/" element={<Navigate to="/projects" replace />} />
                {allRoutes.map((r) => {
                  const C = r.component
                  const el = r.path.includes(':projectKey') ? (
                    <ProjectScope>
                      <C />
                    </ProjectScope>
                  ) : (
                    <C />
                  )
                  return <Route key={r.path} path={r.path} element={el} />
                })}
                <Route path="*" element={<div className="page">Not found.</div>} />
              </Routes>
            </Suspense>
          </main>
        </div>
        <Toaster />
      </HashRouter>
    </QueryClientProvider>
  )
}
