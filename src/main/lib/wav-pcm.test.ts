// Streaming PCM16 WAV helpers (#425): header writer, parser (with the extra chunks macOS
// `say` writes), and window reads.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseWavHeader,
  pcm16ToFloat32,
  pcm16WavHeader,
  readWavInfo,
  readWavWindow,
} from './wav-pcm'

const SAMPLE = resolve('tests/fixtures/hotwash/hotwash-sample.wav')

function wavFile(samples: Int16Array, rate = 16_000): string {
  const dir = mkdtempSync(join(tmpdir(), 'ttx-wav-'))
  const path = join(dir, 'a.wav')
  const data = Buffer.from(samples.buffer)
  writeFileSync(path, Buffer.concat([pcm16WavHeader(data.length, rate), data]))
  return path
}

describe('pcm16WavHeader + parseWavHeader', () => {
  it('round-trips the format and the data size', () => {
    const head = pcm16WavHeader(32_000, 16_000)
    expect(head.byteLength).toBe(44)
    const info = parseWavHeader(head, 44 + 32_000)
    expect(info).toEqual({
      sampleRate: 16_000,
      channels: 1,
      bitsPerSample: 16,
      dataOffset: 44,
      dataBytes: 32_000,
      durationSec: 1,
    })
  })

  it('caps the data at the file size (a header written before the audio finished)', () => {
    const info = parseWavHeader(pcm16WavHeader(1_000_000, 16_000), 44 + 3_200)
    expect(info.dataBytes).toBe(3_200)
    expect(info.durationSec).toBeCloseTo(0.1)
  })

  it('refuses files that are not 16-bit PCM WAV', () => {
    expect(() => parseWavHeader(Buffer.from('ID3 not a wav file at all'), 25)).toThrow(/RIFF/)
    const float = Buffer.from(pcm16WavHeader(0, 16_000))
    float.writeUInt16LE(3, 20) // IEEE float
    expect(() => parseWavHeader(float, 44)).toThrow(/16-bit PCM/)
  })
})

describe('readWavInfo / readWavWindow', () => {
  it('finds the data chunk of the bundled sample after its extra chunks', async () => {
    const info = await readWavInfo(SAMPLE)
    expect(info.sampleRate).toBe(16_000)
    expect(info.channels).toBe(1)
    expect(info.dataOffset).toBeGreaterThan(44)
    expect(info.durationSec).toBeGreaterThan(4)
    expect(info.durationSec).toBeLessThan(5)
  })

  it('reads only the samples between two times', async () => {
    const samples = Int16Array.from({ length: 48_000 }, (_, i) => (i < 16_000 ? 0 : 16_384))
    const path = wavFile(samples)
    const info = await readWavInfo(path)
    const second = await readWavWindow(path, info, 1, 2)
    expect(second.length).toBe(16_000)
    expect(second[0]).toBeCloseTo(0.5)
    const tail = await readWavWindow(path, info, 2.5, 30)
    expect(tail.length).toBe(8_000)
    expect(await readWavWindow(path, info, 5, 6)).toHaveLength(0)
  })

  it('converts PCM16 to floats in [-1, 1)', () => {
    const bytes = new Uint8Array(Int16Array.from([-32768, 0, 32767]).buffer)
    const out = pcm16ToFloat32(bytes)
    expect(out[0]).toBe(-1)
    expect(out[1]).toBe(0)
    expect(out[2]).toBeCloseTo(1, 3)
  })
})
