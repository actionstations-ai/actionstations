// The seek loop over long recordings (#425): window placement, the cut-off last segment heard
// again, absolute timestamps, non-speech markers, resume and guaranteed progress.
import { describe, expect, it } from 'vitest'
import { seekLoop, settleWindow, windowAt, type AudioWindow, type RawSegment } from './windows'

describe('windowAt', () => {
  it('places 30 s windows and marks the one that reaches the end', () => {
    expect(windowAt(0, 100)).toEqual({ startSec: 0, endSec: 30, last: false })
    expect(windowAt(80, 100)).toEqual({ startSec: 80, endSec: 100, last: true })
    expect(windowAt(100, 100)).toBeUndefined()
    expect(windowAt(0, 0)).toBeUndefined()
  })
})

describe('settleWindow', () => {
  const w: AudioWindow = { startSec: 60, endSec: 90, last: false }

  it('makes times absolute and keeps finished segments', () => {
    const out = settleWindow(w, [
      { text: ' First point. ', startSec: 0, endSec: 4.2 },
      { text: 'Second point.', startSec: 4.2, endSec: 9 },
    ])
    expect(out.segments).toEqual([
      { startSec: 60, endSec: 64.2, text: 'First point.' },
      { startSec: 64.2, endSec: 69, text: 'Second point.' },
    ])
    expect(out.nextStartSec).toBe(69)
  })

  it('drops a last segment that runs into the window end and starts the next window there', () => {
    const out = settleWindow(w, [
      { text: 'Kept.', startSec: 0, endSec: 20 },
      { text: 'Cut off mid', startSec: 26.5, endSec: 29.6 },
    ])
    expect(out.segments.map((s) => s.text)).toEqual(['Kept.'])
    expect(out.nextStartSec).toBe(86.5)
  })

  it('treats a segment without an end as cut off', () => {
    const out = settleWindow(w, [
      { text: 'Kept.', startSec: 0, endSec: 10 },
      { text: 'Open', startSec: 12, endSec: null },
    ])
    expect(out.segments).toHaveLength(1)
    expect(out.nextStartSec).toBe(72)
  })

  it('keeps a cut segment that started too early to move on, and moves to the window end', () => {
    const out = settleWindow(w, [{ text: 'One long monologue', startSec: 1, endSec: 30 }])
    expect(out.segments).toEqual([{ startSec: 61, endSec: 90, text: 'One long monologue' }])
    expect(out.nextStartSec).toBe(90)
  })

  it('skips silence and noise markers', () => {
    const out = settleWindow({ ...w, last: true }, [
      { text: '[BLANK_AUDIO]', startSec: 0, endSec: 10 },
      { text: '(coughing)', startSec: 10, endSec: 12 },
      { text: 'Speech.', startSec: 12, endSec: 14 },
    ])
    expect(out.segments.map((s) => s.text)).toEqual(['Speech.'])
  })

  it('keeps everything in the last window', () => {
    const last = { startSec: 60, endSec: 75, last: true }
    const out = settleWindow(last, [{ text: 'Final words', startSec: 10, endSec: null }])
    expect(out.segments).toEqual([{ startSec: 70, endSec: 75, text: 'Final words' }])
    expect(out.nextStartSec).toBe(75)
  })

  it('moves on to the window end when nothing was heard', () => {
    expect(settleWindow(w, []).nextStartSec).toBe(90)
  })
})

/** A fake model: one sentence every 7 s of a recording, cut where the window ends. */
function sentences(w: AudioWindow): RawSegment[] {
  const out: RawSegment[] = []
  for (let t = Math.ceil(w.startSec / 7) * 7; t < w.endSec; t += 7) {
    const end = t + 6
    out.push({
      text: `Sentence at ${t}.`,
      startSec: t - w.startSec,
      endSec: end > w.endSec ? null : end - w.startSec,
    })
  }
  return out
}

describe('seekLoop', () => {
  it('covers a long recording once, in order, with no sentence lost or repeated', async () => {
    const texts: string[] = []
    const starts: number[] = []
    await seekLoop(
      200,
      0,
      async (w) => {
        starts.push(w.startSec)
        return sentences(w)
      },
      (s) => {
        texts.push(...s.segments.map((x) => x.text))
      },
    )
    const expected = Array.from({ length: 29 }, (_, i) => `Sentence at ${i * 7}.`)
    expect(texts).toEqual(expected)
    expect(starts[0]).toBe(0)
    expect(starts.every((s, i) => i === 0 || s > starts[i - 1]!)).toBe(true)
  })

  it('resumes from a saved point', async () => {
    const texts: string[] = []
    await seekLoop(
      60,
      35,
      async (w) => sentences(w),
      (s) => {
        texts.push(...s.segments.map((x) => x.text))
      },
    )
    expect(texts[0]).toBe('Sentence at 35.')
  })

  it('stops between windows when asked', async () => {
    let n = 0
    await expect(
      seekLoop(
        300,
        0,
        async (w) => sentences(w),
        () => undefined,
        () => {
          if (++n > 2) throw new Error('cancelled')
        },
      ),
    ).rejects.toThrow('cancelled')
    expect(n).toBe(3)
  })
})
