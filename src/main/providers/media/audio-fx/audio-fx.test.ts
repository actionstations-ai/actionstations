// Post-FX checked on synthetic signals: band limits by Goertzel, no clipping, durations kept.
import { describe, expect, it } from 'vitest'
import { applyPostFx, decodeWav, encodeWav, toMp3, type PostFx } from './index'
import { gainToDb, rms } from './dsp'

const SR = 48_000

function tones(freqs: number[], seconds: number, amp = 0.2, sr = SR): Float32Array {
  const out = new Float32Array(Math.round(seconds * sr))
  for (let i = 0; i < out.length; i++)
    for (const f of freqs) out[i] = out[i]! + amp * Math.sin((2 * Math.PI * f * i) / sr)
  return out
}

const wavOf = (samples: Float32Array, sampleRate = SR): Uint8Array =>
  encodeWav({ samples, sampleRate })

/** Magnitude of one frequency over [start, end) — Goertzel. */
function goertzel(x: Float32Array, freq: number, sr: number, start: number, end: number): number {
  const k = (2 * Math.PI * freq) / sr
  const coeff = 2 * Math.cos(k)
  let s1 = 0
  let s2 = 0
  for (let i = start; i < end; i++) {
    const s0 = x[i]! + coeff * s1 - s2
    s2 = s1
    s1 = s0
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2) / (end - start)
}

/** Level of `freq` relative to `ref` in the output's middle (away from clicks and tails). */
function relativeDb(fx: PostFx[], freq: number, ref: number): number {
  const out = decodeWav(applyPostFx(wavOf(tones([freq, ref], 2)), fx)).samples
  const a = Math.round(0.5 * SR)
  const b = Math.round(1.5 * SR)
  return gainToDb(goertzel(out, freq, SR, a, b) / goertzel(out, ref, SR, a, b))
}

describe('applyPostFx', () => {
  it('radio keeps 300–3000 Hz and cuts lows and highs', () => {
    expect(relativeDb(['radio'], 100, 1000)).toBeLessThan(-20)
    expect(relativeDb(['radio'], 6000, 1000)).toBeLessThan(-20)
    expect(Math.abs(relativeDb(['radio'], 1500, 1000))).toBeLessThan(6)
  })

  it('phone keeps 300–3400 Hz and cuts outside the telephone band', () => {
    expect(relativeDb(['phone'], 120, 1000)).toBeLessThan(-15)
    expect(relativeDb(['phone'], 7000, 1000)).toBeLessThan(-20)
    expect(Math.abs(relativeDb(['phone'], 2500, 1000))).toBeLessThan(6)
  })

  it('pa high-passes the low end', () => {
    expect(relativeDb(['pa'], 50, 1000)).toBeLessThan(-12)
  })

  it.each<PostFx[]>([
    ['radio'],
    ['phone'],
    ['pa'],
    ['terminal_ambience'],
    ['phone', 'terminal_ambience'],
  ])('%s preserves duration and never clips', (...fx) => {
    // Full-scale square wave: the worst case for overs.
    const loud = tones([440], 1.5, 1).map((v) => (v >= 0 ? 1 : -1))
    const out = decodeWav(applyPostFx(wavOf(loud), fx))
    expect(out.sampleRate).toBe(SR)
    expect(out.samples.length).toBe(loud.length)
    const peak = out.samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    expect(peak).toBeLessThanOrEqual(0.892)
  })

  it('terminal_ambience lays a −24 dBFS bed under silence and ducks it under speech', () => {
    const sr = SR
    const x = new Float32Array(4 * sr)
    x.set(tones([400, 900], 1, 0.3), 2 * sr) // "speech" from 2 s to 3 s
    const out = decodeWav(applyPostFx(wavOf(x), ['terminal_ambience'])).samples
    const silentDb = gainToDb(rms(out, Math.round(0.2 * sr), Math.round(1.8 * sr)))
    expect(silentDb).toBeGreaterThan(-28)
    expect(silentDb).toBeLessThan(-20)
    // Under speech the bed alone (output minus the dry speech) drops by several dB.
    const bedUnder = new Float32Array(Math.round(0.6 * sr))
    for (let i = 0; i < bedUnder.length; i++) {
      const j = Math.round(2.2 * sr) + i
      bedUnder[i] = out[j]! - x[j]!
    }
    expect(gainToDb(rms(bedUnder))).toBeLessThan(silentDb - 3)
  })

  it('resamples unusual rates to 44.1 kHz and keeps the duration', () => {
    const x = tones([500], 1.25, 0.3, 24_000)
    const out = decodeWav(applyPostFx(wavOf(x, 24_000), ['phone']))
    expect(out.sampleRate).toBe(44_100)
    expect(Math.abs(out.samples.length / 44_100 - 1.25)).toBeLessThan(0.002)
  })

  it('is deterministic for a seed', () => {
    const x = wavOf(tones([700], 0.5))
    const a = applyPostFx(x, ['radio', 'terminal_ambience'], { seed: 7 })
    const b = applyPostFx(x, ['radio', 'terminal_ambience'], { seed: 7 })
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  })

  it('returns the input level-limited when no effects are given', () => {
    const out = decodeWav(applyPostFx(wavOf(tones([1000], 0.5, 0.25)), [])).samples
    expect(gainToDb(rms(out))).toBeCloseTo(gainToDb(0.25 / Math.SQRT2), 0)
  })

  it('rejects bytes that are not a WAV', () => {
    expect(() => applyPostFx(new Uint8Array([1, 2, 3, 4]), ['radio'])).toThrow(/WAV/)
  })
})

describe('toMp3', () => {
  it('encodes a WAV to an MP3 bitstream of plausible size', () => {
    const mp3 = toMp3(wavOf(tones([440], 2, 0.3)), 128)
    expect(mp3[0]).toBe(0xff)
    expect(mp3[1]! & 0xe0).toBe(0xe0) // MPEG frame sync
    // 2 s at 128 kbps ≈ 32 kB
    expect(mp3.length).toBeGreaterThan(25_000)
    expect(mp3.length).toBeLessThan(40_000)
  })
})
