// WAV helpers for TTS output: read duration, and join per-speaker clips into one file.
// wavefile is CommonJS: default-import and destructure (named imports crash the ESM build).
import wavefile from 'wavefile'
import { AppError } from '../../../lib/errors'

const { WaveFile } = wavefile

interface WavFmt {
  numChannels: number
  sampleRate: number
}

function load(buf: Uint8Array): InstanceType<typeof WaveFile> {
  try {
    return new WaveFile(buf)
  } catch (err) {
    throw new AppError(
      'PROVIDER',
      `TTS server returned audio that is not WAV: ${(err as Error).message}`,
    )
  }
}

export function wavDurationSec(buf: Uint8Array): number {
  const wav = load(buf)
  const fmt = wav.fmt as WavFmt
  const samples = wav.getSamples(true, Float64Array) as unknown as Float64Array
  return samples.length / fmt.numChannels / fmt.sampleRate
}

/** Concatenate WAV clips (resampled to the first clip's rate, 16-bit) with silence between. */
export function concatWav(clips: Uint8Array[], gapSec = 0.35): Uint8Array {
  if (clips.length === 0) throw new AppError('VALIDATION', 'No audio clips to join')
  if (clips.length === 1) return clips[0]!
  const first = load(clips[0]!)
  const { numChannels, sampleRate } = first.fmt as WavFmt
  const gap = new Int16Array(Math.round(gapSec * sampleRate) * numChannels)
  const parts: Int16Array[] = []
  for (const [i, clip] of clips.entries()) {
    const wav = load(clip)
    const fmt = wav.fmt as WavFmt
    if (fmt.numChannels !== numChannels)
      throw new AppError('PROVIDER', 'TTS clips have different channel counts')
    if (wav.bitDepth !== '16') wav.toBitDepth('16')
    if (fmt.sampleRate !== sampleRate) wav.toSampleRate(sampleRate)
    if (i > 0) parts.push(gap)
    parts.push(wav.getSamples(true, Int16Array) as unknown as Int16Array)
  }
  const total = parts.reduce((n, p) => n + p.length, 0)
  const joined = new Int16Array(total)
  let at = 0
  for (const p of parts) {
    joined.set(p, at)
    at += p.length
  }
  const out = new WaveFile()
  out.fromScratch(numChannels, sampleRate, '16', joined)
  return out.toBuffer()
}

/** Wrap raw little-endian 16-bit mono PCM (ElevenLabs `pcm_*` output) as a WAV file. */
export function pcmToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  if (pcm.length < 2) throw new AppError('PROVIDER', 'The service returned empty audio')
  const samples = new Int16Array(Math.floor(pcm.length / 2))
  const view = new DataView(pcm.buffer, pcm.byteOffset, samples.length * 2)
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true)
  const out = new WaveFile()
  out.fromScratch(1, sampleRate, '16', samples)
  return out.toBuffer()
}

/** Lay a quiet effect track under a voice WAV (mono): looped or cut to the voice length. */
export function mixUnder(voice: Uint8Array, effect: Uint8Array, gain = 0.3): Uint8Array {
  const v = load(voice)
  const e = load(effect)
  const { sampleRate, numChannels } = v.fmt as WavFmt
  if (v.bitDepth !== '16') v.toBitDepth('16')
  if (e.bitDepth !== '16') e.toBitDepth('16')
  if ((e.fmt as WavFmt).sampleRate !== sampleRate) e.toSampleRate(sampleRate)
  const vs = v.getSamples(true, Int16Array) as unknown as Int16Array
  const es = e.getSamples(true, Int16Array) as unknown as Int16Array
  if (!es.length) return voice
  const mixed = new Int16Array(vs.length)
  for (let i = 0; i < vs.length; i++) {
    const sum = vs[i]! + Math.round(es[i % es.length]! * gain)
    mixed[i] = Math.max(-32768, Math.min(32767, sum))
  }
  const out = new WaveFile()
  out.fromScratch(numChannels, sampleRate, '16', mixed)
  return out.toBuffer()
}

/** A short silent WAV, used by tests and fixtures. */
export function silentWav(seconds: number, sampleRate = 24_000): Uint8Array {
  const out = new WaveFile()
  out.fromScratch(1, sampleRate, '16', new Int16Array(Math.round(seconds * sampleRate)))
  return out.toBuffer()
}
