// Whether the presentation window is open: asked once, then kept current by main's
// facilitator:present-changed event (the window can also close itself on Escape) (#235).
import { useEffect, useState } from 'react'
import { subscribe } from '../../lib/api'
import { useIpcQuery } from '../../lib/query'

export function usePresenting(): boolean {
  const status = useIpcQuery('facilitator:present-status', undefined)
  const [live, setLive] = useState<boolean | undefined>(undefined)
  useEffect(() => subscribe('facilitator:present-changed', (e) => setLive(e.open)), [])
  return live ?? status.data?.open ?? false
}
