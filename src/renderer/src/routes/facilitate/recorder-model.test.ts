// Recorder helpers (#425): level wording, chunking for IPC, PCM conversion, error text.
import { describe, expect, it } from 'vitest'
import {
  CHUNK_BYTES,
  floatToPcm16,
  formatBytes,
  formatDuration,
  importProblem,
  inputLevel,
  levelBars,
  microphoneErrorText,
  pcmChunks,
} from './recorder-model'

describe('recorder model', () => {
  it('describes the input level in words', () => {
    expect(inputLevel(0.001, 0.0005)).toBe('silent')
    expect(inputLevel(0.05, 0.01)).toBe('low')
    expect(inputLevel(0.5, 0.1)).toBe('good')
    expect(inputLevel(1, 0.4)).toBe('clipping')
    expect(levelBars(0)).toBe(0)
    expect(levelBars(0.1)).toBeGreaterThan(levelBars(0.01))
    expect(levelBars(1)).toBe(5)
  })

  it('splits PCM into chunks under the IPC limit', () => {
    const chunks = pcmChunks(new Int16Array(40_000))
    expect(chunks.map((c) => c.byteLength)).toEqual([CHUNK_BYTES, CHUNK_BYTES, 16_000])
    expect(chunks.every((c) => c.byteLength <= 64 * 1024)).toBe(true)
  })

  it('converts floats to PCM16 with clamping', () => {
    expect(Array.from(floatToPcm16(Float32Array.from([-2, -1, 0, 0.5, 1, 3])))).toEqual([
      -32768, -32768, 0, 16383, 32767, 32767,
    ])
  })

  it('formats durations and sizes', () => {
    expect(formatDuration(3_725.9)).toBe('1:02:05')
    expect(formatBytes(41e9)).toBe('41 GB')
    expect(formatBytes(1.5e9)).toBe('1.5 GB')
    expect(formatBytes(820e6)).toBe('820 MB')
  })

  it('says where each OS keeps the microphone switch', () => {
    const denied = { name: 'NotAllowedError' }
    expect(microphoneErrorText(denied, 'darwin')).toMatch(/Privacy & Security › Microphone/)
    expect(microphoneErrorText(denied, 'win32')).toMatch(/Settings › Privacy & security/)
    expect(microphoneErrorText({ name: 'NotFoundError' }, 'linux')).toMatch(/No microphone/)
  })

  it('checks imports by type, size and length', () => {
    expect(importProblem('debrief.m4a', 10e6)).toBeUndefined()
    expect(importProblem('debrief.flac', 10e6)).toMatch(/Choose a/)
    expect(importProblem('debrief.mp3', 2 * 1024 ** 3)).toMatch(/1 GB/)
    expect(importProblem('debrief.mp3', 1e6, 3 * 3600)).toMatch(/two hours/)
  })
})
