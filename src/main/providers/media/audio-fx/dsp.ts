// DSP building blocks for the post-FX chain: RBJ-cookbook biquads, a seeded PRNG, noise,
// levels and limiting. Everything works on mono Float32Array samples in [-1, 1].

export type BiquadType = 'lowpass' | 'highpass' | 'bandpass'

export interface BiquadCoefficients {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

/** Robert Bristow-Johnson audio EQ cookbook designs, normalised so a0 = 1. */
export function designBiquad(
  type: BiquadType,
  freqHz: number,
  sampleRate: number,
  q = Math.SQRT1_2,
): BiquadCoefficients {
  const w0 = (2 * Math.PI * Math.min(freqHz, sampleRate * 0.49)) / sampleRate
  const cos = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * q)
  const a0 = 1 + alpha
  let b0: number
  let b1: number
  let b2: number
  if (type === 'lowpass') {
    b0 = (1 - cos) / 2
    b1 = 1 - cos
    b2 = (1 - cos) / 2
  } else if (type === 'highpass') {
    b0 = (1 + cos) / 2
    b1 = -(1 + cos)
    b2 = (1 + cos) / 2
  } else {
    b0 = alpha
    b1 = 0
    b2 = -alpha
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 }
}

/** Run one biquad over the signal (transposed direct form II), returning a new array. */
export function biquad(input: Float32Array, c: BiquadCoefficients): Float32Array {
  const out = new Float32Array(input.length)
  let z1 = 0
  let z2 = 0
  for (let i = 0; i < input.length; i++) {
    const x = input[i]!
    const y = c.b0 * x + z1
    z1 = c.b1 * x - c.a1 * y + z2
    z2 = c.b2 * x - c.a2 * y
    out[i] = y
  }
  return out
}

/** 4th-order band-pass: two Butterworth high-passes then two low-passes. */
export function bandPass(
  input: Float32Array,
  lowHz: number,
  highHz: number,
  sampleRate: number,
): Float32Array {
  const hp = designBiquad('highpass', lowHz, sampleRate)
  const lp = designBiquad('lowpass', highHz, sampleRate)
  return biquad(biquad(biquad(biquad(input, hp), hp), lp), lp)
}

/** Deterministic PRNG (mulberry32) so post-FX output is reproducible for a given seed. */
export function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function whiteNoise(length: number, random: () => number): Float32Array {
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) out[i] = random() * 2 - 1
  return out
}

/** Integrated (brown) noise — the rumble under HVAC beds. Leaky so it never drifts. */
export function brownNoise(length: number, random: () => number): Float32Array {
  const out = new Float32Array(length)
  let last = 0
  for (let i = 0; i < length; i++) {
    last = last * 0.995 + (random() * 2 - 1) * 0.05
    out[i] = last
  }
  return out
}

export function rms(x: Float32Array, start = 0, end = x.length): number {
  let sum = 0
  for (let i = start; i < end; i++) sum += x[i]! * x[i]!
  return end > start ? Math.sqrt(sum / (end - start)) : 0
}

export function peak(x: Float32Array): number {
  let p = 0
  for (const v of x) p = Math.max(p, Math.abs(v))
  return p
}

export const dbToGain = (db: number): number => 10 ** (db / 20)
export const gainToDb = (g: number): number => 20 * Math.log10(Math.max(g, 1e-12))

export function scale(x: Float32Array, gain: number): Float32Array {
  const out = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) out[i] = x[i]! * gain
  return out
}

/** Scale a signal so its RMS equals the target RMS (no-op for silence). */
export function matchRms(x: Float32Array, targetRms: number): Float32Array {
  const r = rms(x)
  return r > 0 ? scale(x, targetRms / r) : x
}

/** Mix `bed` into `x` (same length or shorter), returning a new array. */
export function mix(x: Float32Array, bed: Float32Array): Float32Array {
  const out = Float32Array.from(x)
  for (let i = 0; i < Math.min(x.length, bed.length); i++) out[i] = out[i]! + bed[i]!
  return out
}

/** Keep the peak at or below ceiling (dBFS) by scaling the whole signal. */
export function limitPeak(x: Float32Array, ceilingDb = -1): Float32Array {
  const ceiling = dbToGain(ceilingDb)
  const p = peak(x)
  return p > ceiling ? scale(x, ceiling / p) : x
}

/** One-pole envelope follower (attack / release in seconds) of |x|. */
export function envelope(
  x: Float32Array,
  sampleRate: number,
  attackSec: number,
  releaseSec: number,
): Float32Array {
  const att = Math.exp(-1 / (attackSec * sampleRate))
  const rel = Math.exp(-1 / (releaseSec * sampleRate))
  const out = new Float32Array(x.length)
  let env = 0
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]!)
    const coef = v > env ? att : rel
    env = coef * env + (1 - coef) * v
    out[i] = env
  }
  return out
}
