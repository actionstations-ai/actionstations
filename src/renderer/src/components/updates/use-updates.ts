// The update check's status (#442), refetched whenever main says it changed.
import { useEffect } from 'react'
import type { ChannelRequest } from '@shared/ipc'
import { toast } from '../toast-store'
import { call, subscribe } from '../../lib/api'
import { queryClient, useIpcQuery } from '../../lib/query'

const KEY = ['updates:status', null] as const

export function useUpdateStatus() {
  const status = useIpcQuery('updates:status', undefined)
  useEffect(
    () =>
      subscribe('updates:changed', () => {
        void queryClient.invalidateQueries({ queryKey: ['updates:status'] })
      }),
    [],
  )
  return status
}

/** Change the setting; the answer is the new status. */
export async function setUpdates(req: ChannelRequest<'updates:set'>): Promise<void> {
  const next = await call('updates:set', req)
  queryClient.setQueryData(KEY, next)
}

/** Open the stored release page or the Updates guide section in the OS browser. */
export function openUpdatePage(target: 'release' | 'guide'): void {
  call('updates:open', { target }).catch((err: unknown) =>
    toast.error(
      target === 'release' ? 'Could not open the release page' : 'Could not open the guide',
      err,
    ),
  )
}
