// Delivering injects to devices from Facilitate (#412): whether a session runs, the per-row
// options (targets, send to devices, show expected actions), the receipts that come back, and
// the release / resend / withdraw calls.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Destination } from '@shared/live/schemas/envelope'
import type { LiveDevice, ReleaseSummary, StageStatus } from '@shared/schemas/live'
import { call, subscribe } from '../../../lib/api'
import { queryClient, useIpcQuery } from '../../../lib/query'

export interface RowOptions {
  /** Keep this inject off the devices (the checkbox is on by default). */
  sendToDevices: boolean
  /** Replaces the targets computed from the MSEL row. */
  targets?: Destination[]
  showExpected: boolean
}

const DEFAULTS: RowOptions = { sendToDevices: true, showExpected: false }

export interface LiveDelivery {
  active: boolean
  options: (rowId: string) => RowOptions
  setOptions: (rowId: string, patch: Partial<RowOptions>) => void
  summary: (rowId: string) => ReleaseSummary | undefined
  stage: StageStatus | undefined
  /** Devices in the session, to pick a single one as a target (spec 0412 FR-3). */
  devices: LiveDevice[]
  /** `targets` replaces the plan for this release (spec 0428 FR-6). */
  release: (rowId: string, targets?: Destination[]) => Promise<void>
  resend: (releaseId: string, targets: Destination[]) => Promise<void>
  withdraw: (rowId: string) => Promise<void>
}

export function useLiveDelivery(projectPath: string, scenarioId: string): LiveDelivery {
  const req = useMemo(() => ({ projectPath, scenarioId }), [projectPath, scenarioId])
  const status = useIpcQuery('live:session-status', req)
  const active = !!status.data?.session && !status.data.session.endedAt
  const receipts = useIpcQuery('live:receipts', req, { enabled: active })
  const stage = useIpcQuery('live:stage-status', req, { enabled: active })
  const devices = useIpcQuery('live:devices', req, { enabled: active, refetchInterval: 15_000 })
  const [opts, setOpts] = useState<Record<string, Partial<RowOptions>>>({})

  useEffect(
    () =>
      subscribe('live:changed', (e) => {
        if (e.reason === 'receipts' || e.reason === 'started' || e.reason === 'stopped')
          void queryClient.invalidateQueries({ queryKey: ['live:receipts'] })
        if (e.reason === 'staging' || e.reason === 'started')
          void queryClient.invalidateQueries({ queryKey: ['live:stage-status'] })
      }),
    [],
  )

  const byRow = useMemo(() => {
    const map = new Map<string, ReleaseSummary>()
    for (const s of receipts.data ?? []) if (!s.withdrawn) map.set(s.rowId, s)
    return map
  }, [receipts.data])

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['live:receipts'] }),
    [],
  )

  const options = useCallback((rowId: string) => ({ ...DEFAULTS, ...opts[rowId] }), [opts])
  const setOptions = useCallback(
    (rowId: string, patch: Partial<RowOptions>) =>
      setOpts((o) => ({ ...o, [rowId]: { ...o[rowId], ...patch } })),
    [],
  )

  const release = useCallback(
    async (rowId: string, targets?: Destination[]) => {
      const o = { ...DEFAULTS, ...opts[rowId] }
      if (!o.sendToDevices) return
      const chosen = targets ?? o.targets
      await call('live:release-inject', {
        ...req,
        rowId,
        ...(chosen ? { targets: chosen } : {}),
        showExpected: o.showExpected,
      })
      await refresh()
    },
    [opts, req, refresh],
  )

  const resend = useCallback(
    async (releaseId: string, targets: Destination[]) => {
      await call('live:resend-inject', { ...req, releaseId, targets })
      await refresh()
    },
    [req, refresh],
  )

  const withdraw = useCallback(
    async (rowId: string) => {
      const found = byRow.get(rowId)
      if (!found) return
      await call('live:retract-inject', { ...req, releaseId: found.releaseId })
      await refresh()
    },
    [byRow, req, refresh],
  )

  return {
    active,
    options,
    setOptions,
    summary: (rowId) => byRow.get(rowId),
    stage: stage.data,
    devices: devices.data ?? [],
    release,
    resend,
    withdraw,
  }
}

/** "to 3 · 3 delivered · 2 read · 1 actioned" (FR-10). */
export function receiptLine(s: ReleaseSummary): string {
  const c = s.counts
  return `to ${c.to} · ${c.delivered} delivered · ${c.read} read · ${c.actioned} actioned`
}
