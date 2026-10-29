// Appends branching steps (releases, decisions) to the run's local log (spec 0430 FR-8).
import { useCallback } from 'react'
import type { BranchingLogInput } from '@shared/ipc/facilitator'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'

export type BranchLog = (entries: BranchingLogInput[]) => void

export function useBranchLog(projectPath: string, scenarioId: string): BranchLog {
  return useCallback(
    (entries) => {
      if (!entries.length) return
      call('facilitator:branching-append', { projectPath, scenarioId, entries }).catch(
        (err: Error) => toast.error('Could not record this step of the run', err.message),
      )
    },
    [projectPath, scenarioId],
  )
}
