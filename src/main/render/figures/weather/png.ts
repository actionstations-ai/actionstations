// A minimal PNG writer (8-bit RGBA, no interlace) for figures that draw rasters from data
// (radar, satellite, model fields). Deterministic: the same pixels give the same bytes.
import { deflateSync } from 'node:zlib'

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8)
  return ~c >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** Encode `rgba` (width * height * 4 bytes, row-major from the top) as a PNG. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (rgba.length !== width * height * 4) throw new Error('PNG: pixel data does not match the size')
  const raw = new Uint8Array((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1)
  }
  const header = new Uint8Array(13)
  const hv = new DataView(header.buffer)
  hv.setUint32(0, width)
  hv.setUint32(4, height)
  header.set([8, 6, 0, 0, 0], 8)
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

export const pngDataUri = (png: Uint8Array): string =>
  `data:image/png;base64,${Buffer.from(png).toString('base64')}`
