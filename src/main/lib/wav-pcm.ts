// Streaming helpers for 16-bit PCM WAV files (#425): a header for audio written in chunks,
// a header parser that finds the data chunk after any extra chunks, and window reads, so a
// four-hour recording is never held in memory.
import { promises as fs } from 'node:fs'
import { AppError } from './errors'

export interface WavInfo {
  sampleRate: number
  channels: number
  bitsPerSample: number
  /** Byte offset of the first sample. */
  dataOffset: number
  /** Bytes of sample data. */
  dataBytes: number
  durationSec: number
}

/** The 44-byte header of a PCM16 WAV whose sample data follows it. */
export function pcm16WavHeader(dataBytes: number, sampleRate: number, channels = 1): Uint8Array {
  const header = Buffer.alloc(44)
  const blockAlign = channels * 2
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + dataBytes, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * blockAlign, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(dataBytes, 40)
  return header
}

const notPcm16 = (why: string) =>
  new AppError('VALIDATION', `The recording is not a 16-bit PCM WAV file (${why}).`)

/**
 * Read the fmt and data chunks from the start of a WAV file. `fileSize` caps the data length
 * (a header written before the data finished may claim more than the file holds).
 */
export function parseWavHeader(head: Uint8Array, fileSize: number): WavInfo {
  const buf = Buffer.from(head.buffer, head.byteOffset, head.byteLength)
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF') throw notPcm16('no RIFF header')
  if (buf.toString('ascii', 8, 12) !== 'WAVE') throw notPcm16('no WAVE marker')
  let off = 12
  let fmt: { format: number; channels: number; sampleRate: number; bits: number } | undefined
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    if (id === 'fmt ' && off + 24 <= buf.length) {
      fmt = {
        format: buf.readUInt16LE(off + 8),
        channels: buf.readUInt16LE(off + 10),
        sampleRate: buf.readUInt32LE(off + 12),
        bits: buf.readUInt16LE(off + 22),
      }
    } else if (id === 'data') {
      if (!fmt) throw notPcm16('data before fmt')
      if (fmt.format !== 1 || fmt.bits !== 16) throw notPcm16(`format ${fmt.format}/${fmt.bits}`)
      if (fmt.channels < 1 || fmt.sampleRate < 1) throw notPcm16('no channels')
      const dataOffset = off + 8
      const dataBytes = Math.max(0, Math.min(size, fileSize - dataOffset))
      const frame = fmt.channels * 2
      return {
        sampleRate: fmt.sampleRate,
        channels: fmt.channels,
        bitsPerSample: 16,
        dataOffset,
        dataBytes: dataBytes - (dataBytes % frame),
        durationSec: dataBytes / frame / fmt.sampleRate,
      }
    }
    off += 8 + size + (size % 2)
  }
  throw notPcm16('no data chunk')
}

/** Little-endian PCM16 bytes (mono) as floats in [-1, 1). */
export function pcm16ToFloat32(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out = new Float32Array(Math.floor(bytes.byteLength / 2))
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32768
  return out
}

const HEAD_BYTES = 64 * 1024

/** Open a WAV file and read its header. */
export async function readWavInfo(path: string): Promise<WavInfo> {
  const handle = await fs.open(path, 'r')
  try {
    const { size } = await handle.stat()
    const head = Buffer.alloc(Math.min(HEAD_BYTES, size))
    await handle.read(head, 0, head.length, 0)
    return parseWavHeader(head, size)
  } finally {
    await handle.close()
  }
}

/** Mono float samples between two times of a 16 kHz mono PCM16 WAV. */
export async function readWavWindow(
  path: string,
  info: WavInfo,
  startSec: number,
  endSec: number,
): Promise<Float32Array> {
  if (info.channels !== 1) throw notPcm16(`${info.channels} channels, expected mono`)
  const first = Math.max(0, Math.floor(startSec * info.sampleRate))
  const last = Math.min(info.dataBytes / 2, Math.ceil(endSec * info.sampleRate))
  if (last <= first) return new Float32Array(0)
  const bytes = Buffer.alloc((last - first) * 2)
  const handle = await fs.open(path, 'r')
  try {
    await handle.read(bytes, 0, bytes.length, info.dataOffset + first * 2)
  } finally {
    await handle.close()
  }
  return pcm16ToFloat32(bytes)
}
