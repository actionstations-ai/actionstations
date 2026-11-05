// What the overlay controls hold (#652): which layers are on, and the moment the time slider
// is at. `shown` is what the map draws: the layers that are on, cut to that moment.
import { useMemo, useState } from 'react'
import type { OverlayLayer } from '@shared/schemas'
import { filterAt, timeSteps } from '@shared/maps/overlays/time'

export interface OverlayState {
  layers: readonly OverlayLayer[]
  on: ReadonlySet<string>
  toggle: (id: string) => void
  steps: number[]
  /** Index into `steps`. */
  index: number
  setIndex: (i: number) => void
  /** Draw every time at once instead of one moment. */
  allTimes: boolean
  setAllTimes: (v: boolean) => void
  /** The moment shown, or null when the layers carry no times or all times are shown. */
  at: number | null
  shown: OverlayLayer[]
}

export function useOverlayState(layers: readonly OverlayLayer[]): OverlayState {
  const [off, setOff] = useState<ReadonlySet<string>>(
    () => new Set(layers.filter((l) => !l.visible).map((l) => l.id)),
  )
  const [index, setIndex] = useState(0)
  const [allTimes, setAllTimes] = useState(false)
  const steps = useMemo(() => timeSteps(layers), [layers])
  const on = useMemo(
    () => new Set(layers.filter((l) => !off.has(l.id)).map((l) => l.id)),
    [layers, off],
  )
  const clamped = Math.min(index, Math.max(0, steps.length - 1))
  const at = steps.length && !allTimes ? steps[clamped]! : null
  const shown = useMemo(
    () =>
      filterAt(
        layers.filter((l) => on.has(l.id)),
        at,
      ),
    [layers, on, at],
  )
  const toggle = (id: string) =>
    setOff((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return { layers, on, toggle, steps, index: clamped, setIndex, allTimes, setAllTimes, at, shown }
}
