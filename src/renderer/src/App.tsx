import { Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes, useParams } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { allRoutes } from './routes'
import { queryClient, useIpcQuery } from './lib/query'
import { subscribe } from './lib/api'
import { Toaster } from './components/toast'
import { ChromeFor, RouteFocus, Sidebar, SkipLink } from './components/shell'
import { fromProjectKey, useProjectUi } from './state/project'
import { FirstRunRedirect } from './routes/welcome/FirstRunRedirect'
import { ExampleBanner } from './components/ExampleBanner'

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

/** Keeps the open-project store in sync with /p/:projectKey/* routes. */
function ProjectScope({ children }: { children: React.ReactNode }) {
  const { projectKey: key } = useParams()
  const setProjectPath = useProjectUi((s) => s.setProjectPath)
  useEffect(() => {
    if (key) setProjectPath(fromProjectKey(key))
  }, [key, setProjectPath])
  return (
    <>
      {key && <ExampleBanner projectPath={fromProjectKey(key)} />}
      {children}
    </>
  )
}

function AppRoutes() {
  return (
    <Suspense fallback={<div className="page muted">Loading…</div>}>
      <Routes>
        <Route path="/" element={<FirstRunRedirect />} />
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
        <Route
          path="*"
          element={
            <div className="page">
              <h1>Page not found</h1>
            </div>
          }
        />
      </Routes>
    </Suspense>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <ThemeSync />
        <EventBridge />
        <RouteFocus />
        <ChromeFor
          chrome={
            <>
              <SkipLink />
              <div className="shell">
                <Sidebar />
                <main className="main" id="main">
                  <AppRoutes />
                </main>
              </div>
            </>
          }
          bare={
            <main id="main">
              <AppRoutes />
            </main>
          }
        />
        <Toaster />
      </HashRouter>
    </QueryClientProvider>
  )
}
