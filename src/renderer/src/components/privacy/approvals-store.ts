// Cloud requests waiting for approval (#433). Fed by privacy:pending and the
// outbound:approval-needed / outbound:approval-settled events; the approval host and the jobs
// tray read it and open the dialog for one request id.
import { create } from 'zustand'
import type { OutboundManifest } from '@shared/schemas'
import { call, subscribe } from '../../lib/api'

interface ApprovalsState {
  pending: OutboundManifest[]
  /** The request the dialog shows, or null when it is closed. */
  openId: string | null
  open: (requestId: string) => void
  close: () => void
}

export const useApprovals = create<ApprovalsState>((set) => ({
  pending: [],
  openId: null,
  open: (requestId) => set({ openId: requestId }),
  close: () => set({ openId: null }),
}))

let generation = 0

/** Re-read the pending list from main; drops a closed dialog's id when it is gone. */
export async function refreshPending(): Promise<OutboundManifest[]> {
  const gen = ++generation
  const pending = await call('privacy:pending', {})
  if (gen !== generation) return pending
  useApprovals.setState((s) => ({
    pending,
    openId: s.openId && pending.some((p) => p.requestId === s.openId) ? s.openId : null,
  }))
  return pending
}

/**
 * Subscribe to approval events while mounted. `onNeeded` hears each new request after the list
 * is refreshed (for the toast). Returns the unsubscribe function.
 */
export function connectApprovals(onNeeded?: (m: OutboundManifest | undefined) => void) {
  const offs = [
    subscribe('outbound:approval-needed', (e) => {
      void refreshPending()
        .then((list) => onNeeded?.(list.find((p) => p.requestId === e.requestId)))
        .catch(() => undefined)
    }),
    subscribe('outbound:approval-settled', () => {
      void refreshPending().catch(() => undefined)
    }),
  ]
  void refreshPending().catch(() => undefined)
  return () => offs.forEach((off) => off())
}
