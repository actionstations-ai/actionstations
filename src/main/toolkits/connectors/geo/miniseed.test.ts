// The miniSEED reader on a recorded file: the first 16 records of IU.COR.00.BHZ (EarthScope data
// service) around the 2001 Nisqually earthquake, Steim-2 compressed. The integrity check of every
// record (last sample equals the reverse integration constant) is the correctness test.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeMiniSeed, sampleRateOf } from './miniseed'

const recorded = (): Uint8Array =>
  new Uint8Array(
    Buffer.from(
      readFileSync(join(__dirname, '..', '__fixtures__', 'iu-cor-bhz-nisqually.mseed.b64'), 'utf8'),
      'base64',
    ),
  )

describe('decodeMiniSeed', () => {
  it('decodes a Steim-2 channel into one contiguous trace with passing integrity checks', () => {
    const traces = decodeMiniSeed(recorded())
    expect(traces).toHaveLength(1)
    const t = traces[0]!
    expect([t.network, t.station, t.location, t.channel]).toEqual(['IU', 'COR', '00', 'BHZ'])
    expect(t.warnings).toEqual([])
    expect(t.sampleRate).toBe(20)
    expect(t.samples.length).toBeGreaterThan(500)
    expect(new Date(t.startMs).toISOString().slice(0, 16)).toBe('2001-02-28T18:54')
  })

  it('returns plausible counts: finite integers within a seismometer range', () => {
    const t = decodeMiniSeed(recorded())[0]!
    for (const s of t.samples) {
      expect(Number.isInteger(s)).toBe(true)
      expect(Math.abs(s)).toBeLessThan(2 ** 24)
    }
  })

  it('refuses data that is not miniSEED', () => {
    expect(() => decodeMiniSeed(new TextEncoder().encode('<html>'.padEnd(600, ' ')))).toThrow(
      /not miniSEED/,
    )
  })

  it('reads an uncompressed 16-bit record, either byte order', () => {
    for (const little of [false, true]) {
      const rec = new Uint8Array(512)
      const v = new DataView(rec.buffer)
      new TextEncoder().encodeInto('000001D', rec)
      new TextEncoder().encodeInto('ABC  ', rec.subarray(8))
      new TextEncoder().encodeInto('  ', rec.subarray(13))
      new TextEncoder().encodeInto('HHZ', rec.subarray(15))
      new TextEncoder().encodeInto('XX', rec.subarray(18))
      v.setUint16(20, 2026, little)
      v.setUint16(22, 309, little)
      rec[24] = 1
      rec[25] = 2
      rec[26] = 3
      v.setUint16(30, 4, little)
      v.setInt16(32, 100, little)
      v.setInt16(34, 1, little)
      rec[39] = 1
      v.setUint16(44, 64, little)
      v.setUint16(46, 48, little)
      v.setUint16(48, 1000, little)
      rec[52] = 1
      rec[53] = little ? 0 : 1
      rec[54] = 9
      ;[10, -20, 30, -40].forEach((x, i) => v.setInt16(64 + 2 * i, x, little))
      const t = decodeMiniSeed(rec)[0]!
      expect(t.samples).toEqual([10, -20, 30, -40])
      expect(t.sampleRate).toBe(100)
      expect(new Date(t.startMs).toISOString()).toBe('2026-11-05T01:02:03.000Z')
    }
  })

  it('computes sample rates from factor and multiplier', () => {
    expect(sampleRateOf(20, 1)).toBe(20)
    expect(sampleRateOf(1, -10)).toBe(0.1)
    expect(sampleRateOf(-10, 1)).toBe(0.1)
    expect(sampleRateOf(0, 1)).toBe(0)
  })
})
