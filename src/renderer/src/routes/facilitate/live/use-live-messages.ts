// Messages with the players for the running session (#413): the thread list, one open
// thread, the targets for a new thread, and the send / handled / star / pin calls. The panel
// refetches only the thread a `live:changed` event names.
import { useCallback, useEffect, useMemo } from 'react'
import type { LiveMessage, MessageTarget, ThreadSummary } from '@shared/schemas/live'
import { call, subscribe } from '../../../lib/api'
import { queryClient, useIpcQuery } from '../../../lib/query'

export interface SendRequest {
  channel: string
  text: string
  persona: string
  showPlayedBy: boolean
  replyTo?: string
}

export interface LiveMessages {
  active: boolean
  threads: ThreadSummary[]
  targets: MessageTarget[]
  messages: (channel: string | undefined) => LiveMessage[]
  send: (req: SendRequest) => Promise<LiveMessage>
  open: (channel: string) => Promise<ThreadSummary>
  markHandled: (messageId: string) => Promise<void>
  star: (messageId: string, on: boolean) => Promise<void>
  pin: (messageId: string) => Promise<void>
}

export function useThreadsQuery(projectPath: string, scenarioId: string) {
  const req = useMemo(() => ({ projectPath, scenarioId }), [projectPath, scenarioId])
  const status = useIpcQuery('live:session-status', req)
  const active = !!status.data?.session && !status.data.session.endedAt
  const threads = useIpcQuery('live:threads', req, { enabled: active, refetchInterval: 30_000 })
  useEffect(
    () =>
      subscribe('live:changed', (e) => {
        if (e.reason === 'messages' || e.reason === 'started' || e.reason === 'stopped') {
          void queryClient.invalidateQueries({ queryKey: ['live:threads'] })
          // Only the open thread has an active query, so only it refetches.
          void queryClient.invalidateQueries({ queryKey: ['live:thread'] })
        }
        if (e.reason === 'presence')
          void queryClient.invalidateQueries({ queryKey: ['live:message-targets'] })
      }),
    [req],
  )
  return { req, active, threads: threads.data ?? [] }
}

export function useLiveMessages(
  projectPath: string,
  scenarioId: string,
  channel: string | undefined,
): LiveMessages {
  const { req, active, threads } = useThreadsQuery(projectPath, scenarioId)
  const thread = useIpcQuery(
    'live:thread',
    { ...req, channel: channel ?? '' },
    { enabled: active && !!channel },
  )
  const targets = useIpcQuery('live:message-targets', req, { enabled: active })
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['live:threads'] })
    void queryClient.invalidateQueries({ queryKey: ['live:thread'] })
  }, [])
  const wrap = useCallback(
    <T>(p: Promise<T>) =>
      p.then((v) => {
        refresh()
        return v
      }),
    [refresh],
  )
  return {
    active,
    threads,
    targets: targets.data ?? [],
    messages: (c) => (c && c === channel ? (thread.data ?? []) : []),
    send: (r) => wrap(call('live:message-send', { ...req, ...r })),
    open: (c) => call('live:thread-open', { ...req, channel: c }),
    markHandled: (messageId) => wrap(call('live:message-handled', { ...req, messageId })),
    star: (messageId, on) => wrap(call('live:message-star', { ...req, messageId, on })),
    pin: (messageId) => wrap(call('live:message-pin', { ...req, messageId })),
  }
}
