import { useEffect } from 'react'
import { subscribe } from '../../lib/api'
import { queryClient, useIpcQuery } from '../../lib/query'

/** The pack documents for this project; refetched when packs change. */
export function usePackDocuments(projectPath: string) {
  useEffect(
    () =>
      subscribe('packs:changed', () => {
        void queryClient.invalidateQueries({ queryKey: ['packs:documents'] })
      }),
    [],
  )
  return useIpcQuery('packs:documents', { projectPath }, { enabled: !!projectPath })
}
