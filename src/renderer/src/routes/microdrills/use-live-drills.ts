// Live drills for a project (#437, FR-17): the running session's drills and sending one.
import { useEffect } from 'react'
import { toast } from '../../components/toast-store'
import { call, subscribe } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { queryClient, useIpcQuery } from '../../lib/query'

/** Whether a live session runs for this project, and the drills sent in it. */
export function useLiveDrills(projectPath: string) {
  const query = useIpcQuery('microdrills:live-status', { projectPath }, { refetchInterval: 10_000 })
  useEffect(
    () =>
      subscribe('live:changed', () => {
        void queryClient.invalidateQueries({ queryKey: ['microdrills:live-status'] })
      }),
    [],
  )
  return { running: query.data?.running ?? false, drills: query.data?.drills ?? [] }
}

export async function sendDrillToDevices(projectPath: string, drillId: string): Promise<void> {
  try {
    const view = await call('microdrills:live-open', { projectPath, drillId })
    toast.success('Drill sent', `${view.title} is on players' devices.`)
    await queryClient.invalidateQueries({ queryKey: ['microdrills:live-status'] })
  } catch (e) {
    toast.error('Could not send the drill', errorText(e))
  }
}
