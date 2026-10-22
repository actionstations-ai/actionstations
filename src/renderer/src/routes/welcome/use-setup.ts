// Data hooks shared by the wizard steps.
import { useState } from 'react'
import { call } from '../../lib/api'
import { queryClient, useIpcMutation, useIpcQuery } from '../../lib/query'
import { routeTasks, type Assignment } from './wizard-state'
import { errorText } from '../../lib/errors'

/** Probe localhost once per wizard visit; the result is reused by the text and media steps. */
export function useLocalServices() {
  return useIpcQuery('providers:detect-local', undefined, { staleTime: 60_000 })
}

export function useProviders() {
  return useIpcQuery('providers:list', undefined)
}

export function useUpsertProvider() {
  return useIpcMutation('providers:upsert', { invalidates: ['providers:list', 'routing:get'] })
}

/** Point tasks at providers in the global routing table, keeping every other task. */
export async function saveGlobalRouting(assignments: Assignment[]): Promise<void> {
  if (!assignments.length) return
  const view = await call('routing:get', {})
  let routing = view.global
  for (const a of assignments) routing = routeTasks(routing, a.tasks, a.ref)
  await call('routing:set', { scope: 'global', routing })
  await queryClient.invalidateQueries({ queryKey: ['routing:get'] })
}

/** Run an async action with a busy flag and an error message (null when it succeeded). */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      return true
    } catch (err) {
      setError(errorText(err))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}
