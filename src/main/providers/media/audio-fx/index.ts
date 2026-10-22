// Audio post-FX (#35, ADR-0009): pure TypeScript, no ffmpeg or native code.
//   applyPostFx(wav, ['radio']) → 16-bit mono WAV with the effects applied in order
//   toMp3(wav)                  → MP3 bytes (lamejs)
import { limitPeak, prng } from './dsp'
import { EFFECTS, type PostFx } from './effects'
import { decodeWav, encodeWav } from './wav'

export type { PostFx } from './effects'
export { toMp3 } from './mp3'
export { decodeWav, encodeWav } from './wav'

export const POST_FX: readonly PostFx[] = ['radio', 'phone', 'pa', 'terminal_ambience']

export interface PostFxOptions {
  /** Seed for the noise generators; same seed + input = same output. Default 1. */
  seed?: number
  /** Output peak ceiling in dBFS. Default −1. */
  ceilingDb?: number
}

/** Apply the effects in order and return a 16-bit mono WAV of the same duration. */
export function applyPostFx(
  wavIn: Uint8Array,
  fx: readonly PostFx[],
  opts: PostFxOptions = {},
): Uint8Array {
  const { samples, sampleRate } = decodeWav(wavIn)
  const ctx = { sampleRate, random: prng(opts.seed ?? 1) }
  let out = samples
  for (const name of fx) out = EFFECTS[name](out, ctx)
  return encodeWav({ samples: limitPeak(out, opts.ceilingDb ?? -1), sampleRate })
}
