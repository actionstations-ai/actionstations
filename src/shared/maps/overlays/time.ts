// Time for map overlays (#652): which features show at a moment, the steps for a time slider,
// and the one raster frame that applies. Times are ISO date-times; "no time" means always.
import type { OverlayLayer, OverlayTime, RasterLayer } from '../../schemas/map-overlays'

type Frame = RasterLayer['frames'][number]

const ms = (iso: string | undefined): number | undefined => {
  if (!iso) return undefined
  const n = Date.parse(iso)
  return Number.isNaN(n) ? undefined : n
}

/** True when `at` falls in the range; either end may be open. A missing range is always on. */
export function activeAt(time: OverlayTime | undefined, at: number): boolean {
  if (!time) return true
  const start = ms(time.start)
  const end = ms(time.end)
  return (start === undefined || at >= start) && (end === undefined || at <= end)
}

/**
 * The frame of a raster that shows at `at`: the latest frame that has started, unless it has
 * ended. A frame with no end holds until the next frame starts. Frames with no start time show
 * only when no frame has a start.
 */
export function frameAt(layer: RasterLayer, at: number): Frame | undefined {
  const timed = layer.frames
    .filter((f) => ms(f.time?.start) !== undefined)
    .sort((a, b) => ms(a.time?.start)! - ms(b.time?.start)!)
  if (!timed.length) return layer.frames[0]
  let current: Frame | undefined
  for (const f of timed) if (ms(f.time?.start)! <= at) current = f
  if (!current) return undefined
  const end = ms(current.time?.end)
  return end !== undefined && at > end ? undefined : current
}

/** The layers with only what shows at `at`; null shows everything (a raster shows its last frame). */
export function filterAt(layers: readonly OverlayLayer[], at: number | null): OverlayLayer[] {
  return layers.flatMap((layer): OverlayLayer[] => {
    if (layer.kind === 'raster') {
      const frame = at === null ? layer.frames[layer.frames.length - 1] : frameAt(layer, at)
      return frame ? [{ ...layer, frames: [frame] }] : []
    }
    if (at === null) return [layer]
    const features = (layer.features as { time?: OverlayTime | undefined }[]).filter((f) =>
      activeAt(f.time, at),
    )
    return [{ ...layer, features } as OverlayLayer]
  })
}

function timesOf(layer: OverlayLayer): (OverlayTime | undefined)[] {
  return layer.kind === 'raster'
    ? layer.frames.map((f) => f.time)
    : (layer.features as { time?: OverlayTime | undefined }[]).map((f) => f.time)
}

/** Every start and end time in the layers, in order and without repeats: the slider's steps. */
export function timeSteps(layers: readonly OverlayLayer[]): number[] {
  const out = new Set<number>()
  for (const layer of layers)
    for (const t of timesOf(layer))
      for (const v of [ms(t?.start), ms(t?.end)]) if (v !== undefined) out.add(v)
  return [...out].sort((a, b) => a - b)
}

/** "Nov 4, 14:30 UTC": the slider's text, in UTC so a team in two zones reads the same time. */
export function formatStep(at: number): string {
  const d = new Date(at)
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${month} ${d.getUTCDate()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

/** "Nov 4, 14:30 to Nov 4, 18:00 UTC" for a feature's time range, "" when it has none. */
export function formatRange(time: OverlayTime | undefined): string {
  const start = ms(time?.start)
  const end = ms(time?.end)
  if (start === undefined && end === undefined) return ''
  if (start === undefined) return `until ${formatStep(end!)}`
  if (end === undefined) return `from ${formatStep(start)}`
  return `${formatStep(start)} to ${formatStep(end)}`
}
