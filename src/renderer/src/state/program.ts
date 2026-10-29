// The active exercise program (#424): which folder is open, its summary, and the filters of the
// corrective actions table. Server state comes from IPC queries; only the filters live here.
import { useEffect } from 'react'
import { create } from 'zustand'
import type { CorrectiveActionStatus } from '@shared/schemas'
import { subscribe } from '../lib/api'
import { queryClient, useIpcQuery } from '../lib/query'

export function useActiveProgram() {
  const settings = useIpcQuery('settings:get', undefined, { staleTime: 0 })
  const programPath = settings.data?.program.activePath
  const summary = useIpcQuery(
    'program:get',
    { programPath: programPath ?? '' },
    { enabled: !!programPath },
  )
  return {
    programPath,
    summary: summary.data,
    recent: settings.data?.program.recent ?? [],
    loading: settings.isPending || (!!programPath && summary.isPending),
    error: summary.error,
  }
}

/** Refetch the program queries when another window or computer changes the folder. */
export function useProgramEvents(): void {
  useEffect(
    () =>
      subscribe('program:changed', () => {
        void queryClient.invalidateQueries({
          predicate: (q) =>
            ['program:', 'settings:get'].some((p) => String(q.queryKey[0]).startsWith(p)),
        })
      }),
    [],
  )
}

export const refreshProgramQueries = (): Promise<void> =>
  queryClient.invalidateQueries({
    predicate: (q) => ['program:', 'settings:'].some((p) => String(q.queryKey[0]).startsWith(p)),
  })

export interface ActionFilters {
  statuses: CorrectiveActionStatus[]
  capability: string
  ownerName: string
  projectId: string
  overdueOnly: boolean
}

export const NO_FILTERS: ActionFilters = {
  statuses: ['open', 'in_progress'],
  capability: '',
  ownerName: '',
  projectId: '',
  overdueOnly: false,
}

interface ProgramUiState {
  filters: ActionFilters
  setFilters: (patch: Partial<ActionFilters>) => void
  resetFilters: () => void
}

export const useProgramUi = create<ProgramUiState>((set) => ({
  filters: NO_FILTERS,
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: NO_FILTERS }),
}))
