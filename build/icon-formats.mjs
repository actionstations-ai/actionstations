// Pure encoders for the app icon containers, used by build/make-icons.mjs.
// Both formats simply wrap PNG files, so no image library is needed.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(png) {
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Not a PNG')
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

/** Windows .ico holding PNG images (Vista+). `pngs`: Buffers of square PNGs up to 256 px. */
export function encodeIco(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type 1 = icon
  header.writeUInt16LE(pngs.length, 4)
  const entries = []
  let offset = 6 + 16 * pngs.length
  for (const png of pngs) {
    const { width, height } = pngSize(png)
    if (width > 256 || height > 256) throw new Error(`ICO images are at most 256 px (${width})`)
    const entry = Buffer.alloc(16)
    entry.writeUInt8(width === 256 ? 0 : width, 0)
    entry.writeUInt8(height === 256 ? 0 : height, 1)
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += png.length
  }
  return Buffer.concat([header, ...entries, ...pngs])
}

/** ICNS element types that hold PNG data, keyed by pixel size (1x then 2x variants). */
export const ICNS_TYPES = [
  { type: 'icp4', size: 16 },
  { type: 'icp5', size: 32 },
  { type: 'icp6', size: 64 },
  { type: 'ic07', size: 128 },
  { type: 'ic08', size: 256 },
  { type: 'ic09', size: 512 },
  { type: 'ic10', size: 1024 },
  { type: 'ic11', size: 32 },
  { type: 'ic12', size: 64 },
  { type: 'ic13', size: 256 },
  { type: 'ic14', size: 512 },
]

/** macOS .icns. `pngBySize`: Map<pixelSize, Buffer>; every size in ICNS_TYPES is required. */
export function encodeIcns(pngBySize) {
  const chunks = ICNS_TYPES.map(({ type, size }) => {
    const png = pngBySize.get(size)
    if (!png) throw new Error(`Missing ${size}px PNG for ${type}`)
    if (pngSize(png).width !== size) throw new Error(`${type} needs a ${size}px PNG`)
    const head = Buffer.alloc(8)
    head.write(type, 0, 'ascii')
    head.writeUInt32BE(png.length + 8, 4)
    return Buffer.concat([head, png])
  })
  const body = Buffer.concat(chunks)
  const head = Buffer.alloc(8)
  head.write('icns', 0, 'ascii')
  head.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([head, body])
}

/** Element types and sizes in an .icns file (used to verify the output). */
export function readIcnsTypes(icns) {
  if (icns.toString('ascii', 0, 4) !== 'icns') throw new Error('Not an ICNS file')
  const out = []
  for (let at = 8; at + 8 <= icns.length;) {
    const len = icns.readUInt32BE(at + 4)
    if (len < 8) throw new Error('Corrupt ICNS element')
    out.push({ type: icns.toString('ascii', at, at + 4), bytes: len - 8 })
    at += len
  }
  return out
}
