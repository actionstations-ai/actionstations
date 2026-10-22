// WAV in/out through `wavefile` (any PCM / float bit depth in, 16-bit mono PCM out).
import * as wavefileModule from 'wavefile'
import { AppError } from '../../../lib/errors'

type WaveFileCtor = typeof wavefileModule.WaveFile
// wavefile ships CJS (main) and ESM (module): take the class from whichever shape loaded.
const WaveFile: WaveFileCtor =
  (wavefileModule as { WaveFile?: WaveFileCtor }).WaveFile ??
  (wavefileModule as unknown as { default: { WaveFile: WaveFileCtor } }).default.WaveFile

/** Rates the chain works at; anything else is resampled to 44.1 kHz first. */
const WORKING_RATES = new Set([44_100, 48_000])
const FALLBACK_RATE = 44_100

export interface MonoAudio {
  samples: Float32Array
  sampleRate: number
}

interface WaveFmt {
  numChannels: number
  sampleRate: number
}

/** Decode a WAV to mono float samples, resampling to 44.1 kHz when the rate is unusual. */
export function decodeWav(bytes: Uint8Array): MonoAudio {
  const wav = new WaveFile()
  try {
    wav.fromBuffer(bytes)
  } catch (err) {
    throw new AppError('VALIDATION', `Not a readable WAV file: ${(err as Error).message}`)
  }
  wav.toBitDepth('32f')
  let fmt = wav.fmt as WaveFmt
  if (!WORKING_RATES.has(fmt.sampleRate)) {
    wav.toSampleRate(FALLBACK_RATE, { method: 'sinc' })
    fmt = wav.fmt as WaveFmt
  }
  const raw = wav.getSamples(false, Float32Array) as unknown as Float32Array | Float32Array[]
  return { samples: downmix(raw, fmt.numChannels), sampleRate: fmt.sampleRate }
}

function downmix(raw: Float32Array | Float32Array[], channels: number): Float32Array {
  if (channels <= 1 || !Array.isArray(raw)) return Float32Array.from(raw as Float32Array)
  const out = new Float32Array(raw[0]!.length)
  for (const ch of raw) for (let i = 0; i < out.length; i++) out[i] = out[i]! + ch[i]! / channels
  return out
}

/** 16-bit PCM mono WAV. Samples are clamped to [-1, 1]. */
export function encodeWav(audio: MonoAudio): Uint8Array {
  const pcm = toInt16(audio.samples)
  const wav = new WaveFile()
  wav.fromScratch(1, audio.sampleRate, '16', pcm)
  return wav.toBuffer()
}

export function toInt16(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]!))
    pcm[i] = Math.round(v < 0 ? v * 0x8000 : v * 0x7fff)
  }
  return pcm
}
