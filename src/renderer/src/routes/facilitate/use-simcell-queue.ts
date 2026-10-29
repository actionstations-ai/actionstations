// The SimCell approval queue (spec 0429): drafts waiting for a person, the player messages that
// have no draft yet, and the persona cards. Refetches when main says the queue changed, and
// announces a new draft once, politely.
import { useEffect, useMemo, useState } from 'react'
import { subscribe } from '../../lib/api'
import { queryClient, useIpcQuery } from '../../lib/query'

export function useSimcellQueue(projectPath: string, scenarioId: string) {
  const req = useMemo(() => ({ projectPath, scenarioId }), [projectPath, scenarioId])
  const queue = useIpcQuery('simcell:queue', req, { refetchInterval: 20_000 })
  const personas = useIpcQuery('simcell:personas-get', req)
  const [arrivals, setArrivals] = useState(0)
  useEffect(() => {
    const offQueue = subscribe('simcell:queue-changed', (e) => {
      if (e.scenarioId === scenarioId)
        void queryClient.invalidateQueries({ queryKey: ['simcell:queue'] })
    })
    const offDraft = subscribe('simcell:draft-ready', (e) => {
      if (e.scenarioId !== scenarioId) return
      setArrivals((n) => n + 1)
    })
    return () => {
      offQueue()
      offDraft()
    }
  }, [scenarioId])
  return {
    req,
    drafts: queue.data?.drafts ?? [],
    waiting: queue.data?.waiting ?? [],
    status: queue.data?.status,
    cards: personas.data?.personas ?? [],
    loading: queue.isLoading || personas.isLoading,
    /** Text for a polite live region; changes with every new draft so it is read each time. */
    announcement: arrivals ? `New draft reply ready. ${arrivals} this session.` : '',
  }
}
