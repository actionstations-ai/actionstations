// Deliver / undo / show-on-screen for facilitator timeline rows.
import { useCallback } from 'react'
import type { FacilitatorState } from '@shared/ipc'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { clockMinutes, exerciseStamp } from './clock'
import type { MselRow } from '@shared/schemas/scenario'
import { unfireRow } from './compliance'
import { deliveryAction } from './delivery'
import type { TimelineEntry } from './Timeline'
import type { useFacilitatorState } from './use-facilitator-state'

export type UpdateState = ReturnType<typeof useFacilitatorState>['update']

export interface ActionDeps {
  projectPath: string
  scenarioId: string
  displayId: string
  entries: TimelineEntry[]
  state: FacilitatorState
  update: UpdateState
  onSelect: (rowId: string) => void
  onAnnounce: (text: string) => void
  /** Regulatory triggers (#426): fire a delivered row's triggers; returns the labels started. */
  fireRow?: (s: FacilitatorState, row: MselRow, minutes: number) => FacilitatorState
  /** Labels of the regulations a row's delivery starts clocks for. */
  startsClocks?: (row: MselRow) => string[]
}

export function deliveredMessage(
  entry: TimelineEntry,
  kind: ReturnType<typeof deliveryAction>['kind'],
) {
  const id = entry.row.id
  if (kind === 'present') return `${id} delivered — showing on the presentation screen`
  if (kind === 'play') return `${id} delivered — playing audio on the presentation screen`
  if (kind === 'hand') return `${id} delivered — print / hand to ${entry.target}`
  if (kind === 'read') return `${id} delivered — read aloud`
  return `${id} delivered`
}

function usePresent(projectPath: string, scenarioId: string, displayId: string) {
  return useCallback(
    async (entry: TimelineEntry, assetId?: string) => {
      if (!entry.inject) return
      try {
        await call('facilitator:present', {
          projectPath,
          scenarioId,
          injectId: entry.inject.id,
          ...(assetId ? { assetId } : {}),
          ...(displayId ? { displayId: Number(displayId) } : {}),
        })
      } catch (err) {
        toast.error('Could not open the presentation screen', (err as Error).message)
      }
    },
    [projectPath, scenarioId, displayId],
  )
}

export function useDeliveryActions(d: ActionDeps) {
  const { entries, state, update, onSelect, onAnnounce, fireRow, startsClocks } = d
  const present = usePresent(d.projectPath, d.scenarioId, d.displayId)

  const deliver = useCallback(
    (rowId: string) => {
      const entry = entries.find((e) => e.row.id === rowId)
      if (!entry || state.delivered[rowId]) return
      const now = new Date()
      const minutes = clockMinutes(state, now)
      const stamp = { at: now.toISOString(), exerciseTime: exerciseStamp(minutes) }
      update((s) => {
        const next = { ...s, delivered: { ...s.delivered, [rowId]: stamp } }
        return fireRow ? fireRow(next, entry.row, minutes) : next
      })
      onSelect(rowId)
      const action = deliveryAction(entry.inject)
      if (action.kind === 'present' || action.kind === 'play') void present(entry, action.asset.id)
      const clocks = startsClocks?.(entry.row) ?? []
      onAnnounce(
        deliveredMessage(entry, action.kind) +
          (clocks.length ? ` — reporting clock started: ${clocks.join(', ')}` : ''),
      )
    },
    [entries, state, update, present, onSelect, onAnnounce, fireRow, startsClocks],
  )

  const undo = useCallback(
    (rowId: string) => {
      update((s) => {
        const { [rowId]: _drop, ...rest } = s.delivered
        return unfireRow({ ...s, delivered: rest }, rowId)
      })
      onAnnounce(`${rowId} marked not delivered`)
    },
    [update, onAnnounce],
  )
  return { present, deliver, undo }
}
