// Decisions from Facilitate (spec 0448 FR-14): the scenario's forms, the decisions of the running
// session (kept current by main's `live:changed`, reason "decisions"), and the call that records
// one the facilitator entered.
import { useEffect, useMemo } from 'react'
import type { DecisionForm, DecisionRecord } from '@shared/schemas/decisions'
import { call, subscribe } from '../../../lib/api'
import { queryClient, useIpcQuery } from '../../../lib/query'
import type { EntryDraft } from './decision-model'
import { entryRequest } from './decision-model'

export interface LiveDecisions {
  active: boolean
  forms: DecisionForm[]
  /** Decisions of the running session, oldest first. */
  decisions: DecisionRecord[]
  /** Check and log a decision (when a session runs); returns the record to keep in the file. */
  record: (form: DecisionForm, draft: EntryDraft) => Promise<DecisionRecord>
}

export function useLiveDecisions(projectPath: string, scenarioId: string): LiveDecisions {
  const req = useMemo(() => ({ projectPath, scenarioId }), [projectPath, scenarioId])
  const status = useIpcQuery('live:session-status', req)
  const active = !!status.data?.session && !status.data.session.endedAt
  const forms = useIpcQuery('live:decision-forms', req)
  const decisions = useIpcQuery('live:decisions', req, { enabled: active })

  useEffect(
    () =>
      subscribe('live:changed', (e) => {
        if (e.reason === 'decisions' || e.reason === 'started' || e.reason === 'stopped')
          void queryClient.invalidateQueries({ queryKey: ['live:decisions'] })
      }),
    [],
  )

  return {
    active,
    forms: forms.data ?? [],
    decisions: active ? (decisions.data ?? []) : [],
    record: async (form, draft) => {
      try {
        return await call('live:decision-record', { ...req, ...entryRequest(form, draft) })
      } finally {
        await queryClient.invalidateQueries({ queryKey: ['live:decisions'] })
      }
    },
  }
}
