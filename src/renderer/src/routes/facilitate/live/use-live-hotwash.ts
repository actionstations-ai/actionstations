// The hot wash board of the running session (#415): the board itself, and the calls that open
// and close it, moderate it and promote items. Promoting hands back an entry for
// `facilitator.json`; this page owns that file while it is open, so the entry goes through the
// page's `update` rather than a second writer in the main process.
import { useCallback, useEffect, useMemo } from 'react'
import type { FacilitatorState } from '@shared/ipc'
import type { BoardView, HotWashAction } from '@shared/schemas/live'
import { call, subscribe } from '../../../lib/api'
import { queryClient, useIpcQuery } from '../../../lib/query'
import type { UpdateState } from '../use-delivery-actions'

export interface UpdateRequest {
  action: HotWashAction
  itemIds: string[]
  label?: string
  text?: string
  tags?: { objectiveId?: string | null; capability?: string | null; mselRowId?: string | null }
}

export interface LiveHotwash {
  active: boolean
  board: BoardView | undefined
  open: (review: boolean) => Promise<void>
  close: () => Promise<void>
  setReview: (review: boolean) => Promise<void>
  act: (req: UpdateRequest) => Promise<void>
  promote: (id: string) => Promise<void>
  unpromote: (id: string) => Promise<void>
  present: () => Promise<void>
}

export function useLiveHotwash(
  projectPath: string,
  scenarioId: string,
  update: UpdateState,
): LiveHotwash {
  const req = useMemo(() => ({ projectPath, scenarioId }), [projectPath, scenarioId])
  const status = useIpcQuery('live:session-status', req)
  const active = !!status.data?.session && !status.data.session.endedAt
  const board = useIpcQuery('live:hotwash-board', req, { enabled: active })
  useEffect(
    () =>
      subscribe('live:changed', (e) => {
        if (e.reason === 'hotwash' || e.reason === 'started' || e.reason === 'stopped')
          void queryClient.invalidateQueries({ queryKey: ['live:hotwash-board'] })
      }),
    [],
  )
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['live:hotwash-board'] }),
    [],
  )
  return {
    active,
    board: active ? board.data : undefined,
    open: async (review) => {
      await call('live:hotwash-open', { ...req, review })
      await refresh()
    },
    close: async () => {
      await call('live:hotwash-close', req)
      await refresh()
    },
    setReview: async (review) => {
      await call('live:hotwash-review', { ...req, review })
      await refresh()
    },
    act: async (r) => {
      await call('live:hotwash-update', { ...req, ...r })
      await refresh()
    },
    promote: async (id) => {
      const { entry } = await call('live:hotwash-promote', { ...req, id })
      update((s: FacilitatorState) => ({
        ...s,
        hotwash: [...s.hotwash.filter((h) => h.id !== entry.id), entry],
      }))
      await refresh()
    },
    unpromote: async (id) => {
      const { entryId } = await call('live:hotwash-unpromote', { ...req, id })
      update((s: FacilitatorState) => ({
        ...s,
        hotwash: s.hotwash.filter((h) => h.id !== entryId),
      }))
      await refresh()
    },
    present: () => call('live:hotwash-present', req),
  }
}
