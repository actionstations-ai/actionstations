// Maps and places of the open project (#436). Server state comes from IPC queries; saves send
// the revision they were made against, so a stale save is refused rather than overwriting.
import { useCallback, useEffect } from 'react'
import type { ProjectMaps } from '@shared/schemas'
import { call, subscribe } from '../lib/api'
import { isConflictError } from '../lib/errors'
import { queryClient, useIpcQuery } from '../lib/query'

/** Refetch maps queries when a project's maps or the stored map files change. */
export function useMapsEvents(): void {
  useEffect(() => {
    const refresh = () =>
      void queryClient.invalidateQueries({
        predicate: (q) =>
          String(q.queryKey[0]).startsWith('maps:') || q.queryKey[0] === 'settings:get',
      })
    const offA = subscribe('maps:changed', refresh)
    const offB = subscribe('maps:store-changed', refresh)
    return () => {
      offA()
      offB()
    }
  }, [])
}

export function useProjectMaps(projectPath: string) {
  useMapsEvents()
  const query = useIpcQuery('maps:get', { projectPath })
  const save = useCallback(
    async (mutate: (maps: ProjectMaps) => ProjectMaps | void): Promise<boolean> => {
      const current = query.data
      if (!current) return false
      const draft = structuredClone(current.maps)
      const next = mutate(draft) ?? draft
      try {
        const saved = await call('maps:save', {
          projectPath,
          maps: next,
          revision: current.revision,
        })
        queryClient.setQueryData(['maps:get', { projectPath }], saved)
        return true
      } catch (err) {
        if (isConflictError(err)) await query.refetch()
        throw err
      }
    },
    [projectPath, query],
  )
  return { ...query, save }
}

/** Short random id for a new map or place: letters, digits and a prefix. */
export const newMapId = (prefix: string): string =>
  `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
