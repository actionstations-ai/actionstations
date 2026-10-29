// The Live tab's data: the session status (refetched on every live:changed event and every
// 15 s while a session runs, for the "no connections yet" timer), the computer's addresses and
// the firewall text, plus the start / stop / switch actions with their error state.
import { useCallback, useEffect, useState } from 'react'
import type { LiveConnectionInput, LiveSessionStatus } from '@shared/schemas/live'
import { call, subscribe, type IpcError } from '../../../lib/api'
import { queryClient, useIpcQuery } from '../../../lib/query'

export type LiveBusy = 'idle' | 'starting' | 'stopping' | 'switching'

export function useLiveSession(projectPath: string, scenarioId: string) {
  const req = { projectPath, scenarioId }
  const status = useIpcQuery('live:session-status', req, {
    refetchInterval: (q) =>
      q.state.data?.session && !q.state.data.session.endedAt ? 15_000 : false,
  })
  const addresses = useIpcQuery('live:lan-addresses', undefined, { staleTime: 10_000 })
  const firewall = useIpcQuery('live:firewall-guidance', undefined)
  const [busy, setBusy] = useState<LiveBusy>('idle')
  const [error, setError] = useState<string | undefined>()

  useEffect(
    () =>
      subscribe('live:changed', (e) => {
        void queryClient.invalidateQueries({ queryKey: ['live:session-status'] })
        if (e.reason === 'error' && e.message) setError(e.message)
      }),
    [],
  )

  const run = useCallback(async (what: LiveBusy, fn: () => Promise<unknown>) => {
    setBusy(what)
    setError(undefined)
    try {
      await fn()
    } catch (err) {
      setError((err as IpcError).message)
    } finally {
      setBusy('idle')
      void queryClient.invalidateQueries({ queryKey: ['live:session-status'] })
    }
  }, [])

  return {
    status: status.data as LiveSessionStatus | undefined,
    loading: status.isPending,
    addresses: addresses.data ?? [],
    refreshAddresses: () => void addresses.refetch(),
    firewall: firewall.data,
    busy,
    error,
    start: (connection: LiveConnectionInput, attribution: 'role' | 'named') =>
      run('starting', () => call('live:session-start', { ...req, connection, attribution })),
    stop: () => run('stopping', () => call('live:session-end', req)),
    switchAddress: (address: string) =>
      run('switching', () => call('live:lan-switch-address', { address })),
  }
}
