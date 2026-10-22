import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pngjs from 'pngjs'
import { describe, expect, it } from 'vitest'
import {
  encodeIcns,
  encodeIco,
  ICNS_TYPES,
  pngSize,
  readIcnsTypes,
} from '../../build/icon-formats.mjs'

const { PNG } = pngjs

function solidPng(size: number): Buffer {
  const png = new PNG({ width: size, height: size })
  png.data.fill(0x80)
  return PNG.sync.write(png)
}

describe('pngSize', () => {
  it('reads width and height from IHDR', () => {
    expect(pngSize(solidPng(48))).toEqual({ width: 48, height: 48 })
  })
  it('rejects non-PNG data', () => {
    expect(() => pngSize(Buffer.from('GIF89a........................'))).toThrow(/Not a PNG/)
  })
})

describe('encodeIco', () => {
  it('writes a directory entry per PNG with correct offsets; 256 px is stored as 0', () => {
    const pngs = [solidPng(16), solidPng(256)]
    const ico = encodeIco(pngs)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(2)
    const entry = (i: number) => ico.subarray(6 + 16 * i, 22 + 16 * i)
    expect(entry(0).readUInt8(0)).toBe(16)
    expect(entry(1).readUInt8(0)).toBe(0)
    const offset1 = entry(1).readUInt32LE(12)
    expect(offset1).toBe(6 + 32 + pngs[0]!.length)
    expect(ico.subarray(offset1, offset1 + pngs[1]!.length).equals(pngs[1]!)).toBe(true)
  })
  it('refuses images larger than 256 px', () => {
    expect(() => encodeIco([solidPng(512)])).toThrow(/at most 256/)
  })
})

describe('encodeIcns', () => {
  const all = new Map(ICNS_TYPES.map(({ size }) => [size, solidPng(size)]))

  it('wraps one PNG per element type and records the total length', () => {
    const icns = encodeIcns(all)
    expect(icns.toString('ascii', 0, 4)).toBe('icns')
    expect(icns.readUInt32BE(4)).toBe(icns.length)
    expect(readIcnsTypes(icns).map((e) => e.type)).toEqual(ICNS_TYPES.map((t) => t.type))
  })
  it('fails when a size is missing', () => {
    const partial = new Map(all)
    partial.delete(1024)
    expect(() => encodeIcns(partial)).toThrow(/1024px/)
  })
})

describe('committed icons (build/)', () => {
  it('icon.icns holds every element type, icon.ico 7 sizes, icon.png is 1024 px', () => {
    const icns = readIcnsTypes(readFileSync(resolve('build/icon.icns')))
    expect(icns.map((e) => e.type)).toEqual(ICNS_TYPES.map((t) => t.type))
    const ico = readFileSync(resolve('build/icon.ico'))
    expect(ico.readUInt16LE(4)).toBe(7)
    expect(pngSize(readFileSync(resolve('build/icon.png')))).toEqual({ width: 1024, height: 1024 })
  })
})
