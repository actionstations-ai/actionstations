// Windowing for long recordings (#425). Whisper hears 30 s at a time. Like Whisper's own
// "seek" loop, each window keeps its finished segments and drops the last one when it runs
// into the window's end (it may be cut mid-word); the next window starts where that segment
// started, so it is heard whole. Everything before the next window's start is final, which
// is the resume point after a crash or Cancel.
import type { TranscriptSegmentOut } from '../types'

export const WINDOW_SEC = 30
/** A segment ending this close to the window's end may be cut off: it is heard again. */
export const TAIL_MARGIN_SEC = 1
/** Each window moves on by at least this much, so a long segment cannot stall the loop. */
export const MIN_ADVANCE_SEC = 5

export interface AudioWindow {
  startSec: number
  endSec: number
  /** The window reaches the end of the recording. */
  last: boolean
}

const EPS = 1e-6

/** The window starting at `startSec`, or undefined when the recording is done. */
export function windowAt(
  startSec: number,
  durationSec: number,
  windowSec = WINDOW_SEC,
): AudioWindow | undefined {
  if (!(durationSec > 0) || startSec >= durationSec - EPS) return undefined
  const endSec = Math.min(durationSec, startSec + windowSec)
  return { startSec, endSec, last: endSec >= durationSec - EPS }
}

/** Text Whisper writes for silence or noise rather than speech. */
const NON_SPEECH = /^[[(][^\])]*[\])]$/

export interface RawSegment {
  text: string
  /** Seconds from the window's start. */
  startSec: number
  /** Null when the model gave no end (the segment runs to the window's end). */
  endSec: number | null
}

export interface SettledWindow {
  segments: TranscriptSegmentOut[]
  /** Where the next window starts; everything before it is final. */
  nextStartSec: number
}

const round2 = (n: number): number => Math.round(n * 100) / 100

function absolute(w: AudioWindow, s: RawSegment): TranscriptSegmentOut & { open: boolean } {
  const startSec = Math.min(w.startSec + Math.max(0, s.startSec), w.endSec)
  const endSec =
    s.endSec === null ? w.endSec : Math.min(w.endSec, Math.max(startSec, w.startSec + s.endSec))
  return { startSec, endSec, text: s.text.trim(), open: s.endSec === null }
}

/**
 * Absolute segments a window keeps, and where the next window starts. The last window keeps
 * everything. Otherwise a final segment that is open or ends within TAIL_MARGIN_SEC of the
 * window's end is dropped and heard again from its start, unless that would not move on.
 */
export function settleWindow(w: AudioWindow, raw: RawSegment[]): SettledWindow {
  const all = raw.map((s) => absolute(w, s)).filter((s) => s.text && !NON_SPEECH.test(s.text))
  all.sort((a, b) => a.startSec - b.startSec)
  const minNext = Math.min(w.endSec, w.startSec + MIN_ADVANCE_SEC)
  let keep = all
  let next = w.endSec
  if (!w.last && all.length) {
    const tail = all[all.length - 1]!
    const cut = tail.open || tail.endSec >= w.endSec - TAIL_MARGIN_SEC
    if (cut && tail.startSec >= minNext - EPS) {
      keep = all.slice(0, -1)
      next = tail.startSec
    } else if (!cut) {
      next = Math.max(tail.endSec, minNext)
    }
  }
  return {
    segments: keep.map((s) => ({
      startSec: round2(s.startSec),
      endSec: round2(s.endSec),
      text: s.text,
    })),
    nextStartSec: next,
  }
}

/**
 * Run the seek loop over a recording: `hear` transcribes one window (times relative to its
 * start) and `onWindow` receives what that window settled, in order.
 */
export async function seekLoop(
  durationSec: number,
  fromSec: number,
  hear: (w: AudioWindow) => Promise<RawSegment[]>,
  onWindow: (settled: SettledWindow, w: AudioWindow) => Promise<void> | void,
  shouldStop?: () => void,
): Promise<void> {
  let start = fromSec
  for (let w = windowAt(start, durationSec); w; w = windowAt(start, durationSec)) {
    shouldStop?.()
    const settled = settleWindow(w, await hear(w))
    await onWindow(settled, w)
    start = settled.nextStartSec
  }
}
