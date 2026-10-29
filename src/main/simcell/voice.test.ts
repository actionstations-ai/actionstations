import { describe, expect, it } from 'vitest'
import { encodeWav } from '../providers/media/audio-fx/wav'
import { assertClip, MAX_CLIP_SECONDS } from './voice'

const wav = (seconds: number, sampleRate = 16_000): Uint8Array =>
  encodeWav({ samples: new Float32Array(Math.round(seconds * sampleRate)).fill(0.1), sampleRate })

describe('a player recording', () => {
  it('accepts a 16 kHz mono WAV within the size and length limits and returns its length', () => {
    expect(assertClip(wav(5), 2 * 1024 * 1024)).toBeCloseTo(5, 1)
  })

  it('refuses a recording larger than the connection allows', () => {
    expect(() => assertClip(wav(30), 100_000)).toThrow(/empty or too large/)
  })

  it('refuses something that is not a WAV file', () => {
    expect(() => assertClip(new Uint8Array(5000).fill(7), 1_000_000)).toThrow(/not a WAV/)
  })

  it('refuses a different sample rate', () => {
    expect(() => assertClip(wav(2, 44_100), 1_000_000)).toThrow(/16 kHz/)
  })

  it('refuses a recording longer than a call turn', () => {
    expect(() => assertClip(wav(MAX_CLIP_SECONDS + 5), 10_000_000)).toThrow(/too long/)
  })
})
