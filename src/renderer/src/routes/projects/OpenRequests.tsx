// Opens project folders the OS hands the app (double-clicked .asproj / .ttxproj, #277): the
// ones queued before the window loaded, then each later one as it arrives.
import { useEffect, useEffectEvent } from 'react'
import { call, subscribe } from '../../lib/api'
import { useOpenProject } from './use-open-project'

export function OpenRequests() {
  const { open } = useOpenProject()
  const openPath = useEffectEvent((path: string) => void open(path))
  useEffect(() => {
    const off = subscribe('app:open-project', ({ path }) => openPath(path))
    void call('app:pending-opens').then((paths) => {
      // Several at once: the last one ends up on screen; all join the recent list.
      for (const path of paths) openPath(path)
    })
    return off
  }, [])
  return null
}
