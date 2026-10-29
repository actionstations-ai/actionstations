// Votes from Facilitate (#414): the session's votes, kept current by main's `live:changed`
// (reason "votes"), and the calls that open, close, reopen, show and record them.
import { useCallback, useEffect, useMemo } from 'react'
import type { FacilitatorDecision } from '@shared/ipc/facilitator'
import type { VoteDefinition, VoteView } from '@shared/schemas/live'
import { call, subscribe } from '../../../lib/api'
import { queryClient, useIpcQuery } from '../../../lib/query'

export interface LiveVotes {
  active: boolean
  votes: VoteView[]
  open: (definition: VoteDefinition, rowId?: string) => Promise<VoteView>
  close: (voteId: string) => Promise<void>
  reopen: (voteId: string) => Promise<void>
  show: (voteId: string) => Promise<void>
  /** Marks the vote recorded and returns the decision entry to add to the decision log. */
  record: (voteId: string) => Promise<FacilitatorDecision>
}

export function useLiveVotes(projectPath: string, scenarioId: string): LiveVotes {
  const req = useMemo(() => ({ projectPath, scenarioId }), [projectPath, scenarioId])
  const status = useIpcQuery('live:session-status', req)
  const active = !!status.data?.session && !status.data.session.endedAt
  const votes = useIpcQuery('live:votes', req, { enabled: active })

  useEffect(
    () =>
      subscribe('live:changed', (e) => {
        if (e.reason === 'votes' || e.reason === 'started' || e.reason === 'stopped')
          void queryClient.invalidateQueries({ queryKey: ['live:votes'] })
      }),
    [],
  )
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ['live:votes'] }), [])
  const act = useCallback(
    async <T>(run: () => Promise<T>): Promise<T> => {
      try {
        return await run()
      } finally {
        await refresh()
      }
    },
    [refresh],
  )

  return {
    active,
    votes: active ? (votes.data ?? []) : [],
    open: (definition, rowId) =>
      act(() => call('live:vote-open', { ...req, definition, ...(rowId ? { rowId } : {}) })),
    close: (voteId) => act(() => call('live:vote-close', { ...req, voteId }).then(() => undefined)),
    reopen: (voteId) =>
      act(() => call('live:vote-reopen', { ...req, voteId }).then(() => undefined)),
    show: (voteId) => call('live:vote-present', { ...req, voteId }),
    record: (voteId) => act(() => call('live:vote-record', { ...req, voteId })),
  }
}
