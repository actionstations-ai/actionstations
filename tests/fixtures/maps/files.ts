// Map fixtures that need no native modules (#436): PNG tiles and a PMTiles v3 file. Safe to load
// from Playwright's own Node process as well as from Vitest.
import { writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'

/** A solid-colour PNG tile. */
export function solidPng(size: number, rgba: [number, number, number, number]): Buffer {
  const png = new PNG({ width: size, height: size })
  for (let i = 0; i < size * size; i++) png.data.set(rgba, i * 4)
  return PNG.sync.write(png)
}

export const FIXTURE_BOUNDS = { w: -83, s: 39, e: -82, n: 40 }

function varint(n: number): number[] {
  const out: number[] = []
  let v = n
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80)
    v = Math.floor(v / 128)
  }
  out.push(v)
  return out
}

/** A PMTiles v3 file with one raster tile at z0/0/0 (uncompressed directory, PNG tile). */
export function makePmtiles(path: string, png: Buffer, attribution = 'Fixture data'): void {
  const dir = Buffer.from([
    ...varint(1),
    ...varint(0),
    ...varint(1),
    ...varint(png.length),
    ...varint(1),
  ])
  const meta = Buffer.from(JSON.stringify({ name: 'Fixture', attribution }))
  const head = Buffer.alloc(127)
  head.write('PMTiles', 0, 'ascii')
  head[7] = 3
  const rootOff = 127
  const metaOff = rootOff + dir.length
  const dataOff = metaOff + meta.length
  head.writeBigUInt64LE(BigInt(rootOff), 8)
  head.writeBigUInt64LE(BigInt(dir.length), 16)
  head.writeBigUInt64LE(BigInt(metaOff), 24)
  head.writeBigUInt64LE(BigInt(meta.length), 32)
  head.writeBigUInt64LE(BigInt(dataOff), 40)
  head.writeBigUInt64LE(0n, 48)
  head.writeBigUInt64LE(BigInt(dataOff), 56)
  head.writeBigUInt64LE(BigInt(png.length), 64)
  head.writeBigUInt64LE(1n, 72)
  head.writeBigUInt64LE(1n, 80)
  head.writeBigUInt64LE(1n, 88)
  head[96] = 1
  head[97] = 1 // internal compression: none
  head[98] = 1 // tile compression: none
  head[99] = 2 // tile type: png
  head[100] = 0
  head[101] = 0
  head.writeInt32LE(FIXTURE_BOUNDS.w * 1e7, 102)
  head.writeInt32LE(FIXTURE_BOUNDS.s * 1e7, 106)
  head.writeInt32LE(FIXTURE_BOUNDS.e * 1e7, 110)
  head.writeInt32LE(FIXTURE_BOUNDS.n * 1e7, 114)
  head[118] = 0
  writeFileSync(path, Buffer.concat([head, dir, meta, png]))
}
