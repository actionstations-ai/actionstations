// Surveys on devices from Facilitate and the Surveys page (#422): the surveys sent in the
// running session, kept current by main's `live:changed` (reason "surveys"), and the calls that
// send, close and, for a survey-only session, start and end the session.
import { useCallback, useEffect, useMemo } from 'react'
import type { InviteView, LiveSurveyView } from '@shared/schemas/live'
import { call, subscribe } from '../../../lib/api'
import { queryClient, useIpcQuery } from '../../../lib/query'

export interface LiveSurveys {
  /** A session runs for this scenario. */
  active: boolean
  surveyOnly: boolean
  /** The join link and QR for phones, from the running session. */
  invite: InviteView | undefined
  views: LiveSurveyView[]
  send: (surveyId: string) => Promise<void>
  close: (deliveryId: string) => Promise<void>
  /** Start a session for surveys only on this computer, then send the survey. */
  startAndSend: (surveyId: string) => Promise<void>
  end: () => Promise<void>
}

const KEYS = ['live:session-status', 'surveys:live-status']

export function useLiveSurveys(projectPath: string, scenarioId: string): LiveSurveys {
  const req = useMemo(() => ({ projectPath, scenarioId }), [projectPath, scenarioId])
  const status = useIpcQuery('live:session-status', req)
  const session = status.data?.session
  const active = !!session && !session.endedAt
  const views = useIpcQuery('surveys:live-status', req, { enabled: active })

  useEffect(
    () =>
      subscribe('live:changed', (e) => {
        if (e.reason === 'surveys' || e.reason === 'started' || e.reason === 'stopped')
          for (const queryKey of KEYS) void queryClient.invalidateQueries({ queryKey: [queryKey] })
      }),
    [],
  )
  const refresh = useCallback(
    () =>
      Promise.all(KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey: [queryKey] }))),
    [],
  )
  const act = useCallback(
    async (run: () => Promise<unknown>): Promise<void> => {
      try {
        await run()
      } finally {
        await refresh()
      }
    },
    [refresh],
  )

  return {
    active,
    surveyOnly: active && !!session?.surveyOnly,
    invite: active ? status.data?.invites?.players : undefined,
    views: active ? (views.data ?? []) : [],
    send: (surveyId) => act(() => call('surveys:open-live', { ...req, surveyId })),
    close: (deliveryId) => act(() => call('surveys:close-live', { ...req, deliveryId })),
    startAndSend: (surveyId) =>
      act(async () => {
        await call('live:session-start', {
          ...req,
          connection: { kind: 'lan' },
          attribution: 'role',
          surveyOnly: true,
          allowPublicAddress: false,
        })
        await call('surveys:open-live', { ...req, surveyId })
      }),
    end: () => act(() => call('live:session-end', req)),
  }
}
