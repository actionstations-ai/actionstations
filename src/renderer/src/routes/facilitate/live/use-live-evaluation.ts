// Live evaluator observations for the running session (#416): the coverage view (who has rated
// which task), and the watch-list, ask-to-watch and show-expected calls. The view refetches on
// every `live:changed` event that can change it, and the Evaluate tab's record refetches with it.
import { useCallback, useEffect, useMemo } from 'react'
import type { EvaluatorWatch } from '@shared/schemas/live'
import { call, subscribe } from '../../../lib/api'
import { queryClient, useIpcQuery } from '../../../lib/query'

export function useLiveEvaluation(projectPath: string, scenarioId: string) {
  const req = useMemo(() => ({ projectPath, scenarioId }), [projectPath, scenarioId])
  const status = useIpcQuery('live:session-status', req)
  const active = !!status.data?.session && !status.data.session.endedAt
  const coverage = useIpcQuery('live:eval-coverage', req, { enabled: active })
  useEffect(
    () =>
      subscribe('live:changed', (e) => {
        if (e.reason === 'evaluation' || e.reason === 'presence' || e.reason === 'started') {
          void queryClient.invalidateQueries({ queryKey: ['live:eval-coverage'] })
        }
        if (e.reason === 'evaluation') {
          void queryClient.invalidateQueries({ queryKey: ['evaluation:get'] })
        }
      }),
    [],
  )
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['live:eval-coverage'] }),
    [],
  )
  return {
    active,
    coverage: active ? coverage.data : undefined,
    loading: active && coverage.isPending,
    error: coverage.isError,
    setWatch: async (clientRef: string, watch: EvaluatorWatch) => {
      await call('live:eval-watch', { ...req, clientRef, watch })
      await refresh()
    },
    ask: (clientRef: string, text: string) => call('live:eval-ask', { ...req, clientRef, text }),
    setShowExpected: async (on: boolean) => {
      await call('live:eval-show-expected', { ...req, on })
      await refresh()
    },
  }
}
