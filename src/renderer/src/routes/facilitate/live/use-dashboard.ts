// The Room's data (#417): the dashboard of the running session (or a past one), refetched on
// `live:changed` with a 250 ms debounce and on a 30 s tick so "No response" ages show up.
import { useEffect, useMemo } from 'react'
import { subscribe } from '../../../lib/api'
import { queryClient, useIpcQuery } from '../../../lib/query'

const DEBOUNCE_MS = 250
const TICK_MS = 30_000

export function useDashboard(
  projectPath: string,
  scenarioId: string,
  sessionId?: string,
  enabled = true,
) {
  const req = useMemo(
    () => ({ projectPath, scenarioId, ...(sessionId ? { sessionId } : {}) }),
    [projectPath, scenarioId, sessionId],
  )
  const query = useIpcQuery('live:dashboard', req, { refetchInterval: TICK_MS, enabled })
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = subscribe('live:changed', () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['live:dashboard'] })
        void queryClient.invalidateQueries({ queryKey: ['live:log-tail'] })
        void queryClient.invalidateQueries({ queryKey: ['live:sessions-list'] })
      }, DEBOUNCE_MS)
    })
    return () => {
      clearTimeout(timer)
      off()
    }
  }, [])
  return { req, view: query.data, loading: query.isLoading, error: query.error?.message }
}
