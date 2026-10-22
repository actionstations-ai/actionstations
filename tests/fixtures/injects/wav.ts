// Shrink WAV clips copied into the fixture folder: mono, 16 kHz, 16-bit, first N seconds.
// wavefile is CommonJS: default-import (named imports crash the built ESM main process).
import wavefile from 'wavefile'

const { WaveFile } = wavefile

export function shrinkWav(bytes: Uint8Array, maxSec = 15, sampleRate = 16000): Buffer {
  const wav = new WaveFile(bytes)
  wav.toBitDepth('16')
  wav.toSampleRate(sampleRate)
  const samples = wav.getSamples(true, Int16Array) as unknown as Int16Array
  const channels = Number((wav.fmt as { numChannels: number }).numChannels) || 1
  const mono = channels === 1 ? samples : samples.filter((_, i) => i % channels === 0)
  const out = new WaveFile()
  out.fromScratch(1, sampleRate, '16', mono.slice(0, sampleRate * maxSec))
  return Buffer.from(out.toBuffer())
}
