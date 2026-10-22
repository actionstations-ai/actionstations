// The four post-FX that sell a voice inject's medium (ADR-0009). Each takes mono samples and
// returns a new array of the same length, so durations are preserved through the chain.
import {
  bandPass,
  biquad,
  dbToGain,
  designBiquad,
  envelope,
  matchRms,
  mix,
  rms,
  scale,
  whiteNoise,
  brownNoise,
} from './dsp'

export type PostFx = 'radio' | 'phone' | 'pa' | 'terminal_ambience'

export interface FxContext {
  sampleRate: number
  random: () => number
}

/** Saturating soft clip: loud syllables squash, quiet ones come up (two-way radio AGC feel). */
function softClip(x: Float32Array, drive: number): Float32Array {
  const norm = Math.tanh(drive)
  const out = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) out[i] = Math.tanh(drive * x[i]!) / norm
  return out
}

/** Noise burst that decays exponentially — a squelch tail or key-up click. */
function burst(length: number, ctx: FxContext, level: number, decaySec: number): Float32Array {
  const noise = bandPass(whiteNoise(length, ctx.random), 500, 4000, ctx.sampleRate)
  const k = 1 / (decaySec * ctx.sampleRate)
  const norm = rms(noise) || 1
  for (let i = 0; i < length; i++) noise[i] = (noise[i]! / norm) * level * Math.exp(-i * k)
  return noise
}

function overlay(target: Float32Array, src: Float32Array, at: number): void {
  for (let i = 0; i < src.length && at + i < target.length; i++)
    if (at + i >= 0) target[at + i] = target[at + i]! + src[i]!
}

/** Two-way radio: 300–3000 Hz band, hard-driven compression, hiss, key-up click, squelch tail. */
export function radio(x: Float32Array, ctx: FxContext): Float32Array {
  const sr = ctx.sampleRate
  const voiced = matchRms(bandPass(x, 300, 3000, sr), 0.12)
  const y = bandPass(softClip(voiced, 3), 300, 3000, sr)
  const hiss = matchRms(bandPass(whiteNoise(x.length, ctx.random), 300, 3000, sr), dbToGain(-38))
  const out = mix(y, hiss)
  const click = burst(Math.round(0.04 * sr), ctx, 0.2, 0.01)
  overlay(out, click, 0)
  const tailLen = Math.min(Math.round(0.2 * sr), out.length)
  overlay(out, burst(tailLen, ctx, 0.25, 0.08), out.length - tailLen)
  return out
}

const MU = 255

/** Telephone: 300–3400 Hz band, 8-bit mu-law companding (G.711-style grit), faint line noise. */
export function phone(x: Float32Array, ctx: FxContext): Float32Array {
  const band = bandPass(x, 300, 3400, ctx.sampleRate)
  const p = band.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1
  const out = new Float32Array(band.length)
  for (let i = 0; i < band.length; i++) {
    const v = (band[i]! / p) * 0.9
    const c = (Math.sign(v) * Math.log1p(MU * Math.abs(v))) / Math.log1p(MU)
    const q = Math.round(c * 127) / 127
    out[i] = (Math.sign(q) * ((1 + MU) ** Math.abs(q) - 1)) / MU
  }
  const line = matchRms(
    bandPass(whiteNoise(x.length, ctx.random), 300, 3400, ctx.sampleRate),
    dbToGain(-50),
  )
  return mix(out, line)
}

function comb(x: Float32Array, delay: number, feedback: number, damp: number): Float32Array {
  const out = new Float32Array(x.length)
  const buf = new Float32Array(delay)
  let idx = 0
  let lp = 0
  for (let i = 0; i < x.length; i++) {
    const y = buf[idx]!
    lp = y * (1 - damp) + lp * damp
    buf[idx] = x[i]! + lp * feedback
    out[i] = y
    idx = (idx + 1) % delay
  }
  return out
}

function allpass(x: Float32Array, delay: number, g: number): Float32Array {
  const out = new Float32Array(x.length)
  const buf = new Float32Array(delay)
  let idx = 0
  for (let i = 0; i < x.length; i++) {
    const delayed = buf[idx]!
    const y = -g * x[i]! + delayed
    buf[idx] = x[i]! + g * y
    out[i] = y
    idx = (idx + 1) % delay
  }
  return out
}

const COMB_MS = [29.7, 37.1, 41.1, 43.7]
const ALLPASS_MS = [5.0, 1.7]

/** Public address: thin high-passed horn tone plus a short Schroeder reverb (concourse). */
export function pa(x: Float32Array, ctx: FxContext): Float32Array {
  const sr = ctx.sampleRate
  const hp = designBiquad('highpass', 220, sr)
  const lp = designBiquad('lowpass', 6000, sr)
  const dry = biquad(biquad(biquad(x, hp), hp), lp)
  const wet = new Float32Array(dry.length)
  for (const ms of COMB_MS) {
    const c = comb(dry, Math.round((ms / 1000) * sr), 0.74, 0.3)
    for (let i = 0; i < wet.length; i++) wet[i] = wet[i]! + c[i]! / COMB_MS.length
  }
  let diffused: Float32Array = wet
  for (const ms of ALLPASS_MS) diffused = allpass(diffused, Math.round((ms / 1000) * sr), 0.7)
  return mix(scale(dry, 0.8), scale(diffused, 0.45))
}

/** Slow syllable-rate amplitude envelope with pauses — one distant talker. */
function talkerEnvelope(length: number, ctx: FxContext): Float32Array {
  const sr = ctx.sampleRate
  const env = new Float32Array(length)
  const f1 = 2 + ctx.random() * 3
  const f2 = 0.3 + ctx.random() * 0.4
  const phase = ctx.random() * Math.PI * 2
  for (let i = 0; i < length; i++) {
    const t = i / sr
    const syllables = Math.abs(Math.sin(Math.PI * f1 * t + phase))
    const phrase = Math.max(0, Math.sin(2 * Math.PI * f2 * t + phase * 1.7) + 0.3)
    env[i] = syllables * phrase
  }
  return env
}

const TALKERS = 7
const BED_DB = -24

/** Crowd murmur + HVAC bed at −24 dBFS RMS, ducked ~6 dB under the speech. */
export function terminalAmbience(x: Float32Array, ctx: FxContext): Float32Array {
  const sr = ctx.sampleRate
  const murmur = new Float32Array(x.length)
  for (let t = 0; t < TALKERS; t++) {
    const center = 300 + ctx.random() * 900
    const voice = biquad(
      whiteNoise(x.length, ctx.random),
      designBiquad('bandpass', center, sr, 1.4),
    )
    const env = talkerEnvelope(x.length, ctx)
    for (let i = 0; i < murmur.length; i++) murmur[i] = murmur[i]! + voice[i]! * env[i]!
  }
  const rumble = biquad(brownNoise(x.length, ctx.random), designBiquad('lowpass', 250, sr))
  const air = biquad(whiteNoise(x.length, ctx.random), designBiquad('lowpass', 1200, sr))
  const hvac = mix(matchRms(rumble, 0.6), matchRms(air, 0.25))
  const bed = matchRms(mix(matchRms(murmur, 1), matchRms(hvac, 0.7)), dbToGain(BED_DB))
  const speech = envelope(x, sr, 0.01, 0.4)
  for (let i = 0; i < bed.length; i++) bed[i] = bed[i]! * (1 - 0.5 * Math.min(1, speech[i]! / 0.05))
  return mix(x, bed)
}

export const EFFECTS: Record<PostFx, (x: Float32Array, ctx: FxContext) => Float32Array> = {
  radio,
  phone,
  pa,
  terminal_ambience: terminalAmbience,
}
