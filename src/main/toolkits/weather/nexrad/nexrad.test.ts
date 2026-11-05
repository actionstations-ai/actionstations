// The bzip2 and Level II decoders on recorded data: small streams made by the bzip2 tool, and
// the first records of a real volume (KILN, 7 May 2024, 20:03Z).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Bzip2Error, bunzip2 } from './bzip2'
import { Level2Error, decodeVolume, momentValue } from './level2'
import { polarFromSweep } from './polar'
import { FIXTURE_PATH, fixtureVolume } from './sample'
import { unpackCodes } from '../../../render/figures/weather/polar'

const cases = JSON.parse(
  readFileSync(join(__dirname, '../../../../../tests/fixtures/weather/bzip2-cases.json'), 'utf8'),
) as Record<string, { plain: string; bz2: string }>
const bytes = (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex'))

describe('bunzip2', () => {
  it.each(Object.keys(cases))('decodes the %s stream exactly', (name) => {
    expect(Buffer.from(bunzip2(bytes(cases[name]!.bz2))).toString('hex')).toBe(cases[name]!.plain)
  })

  it('refuses a stream without the BZh header', () => {
    expect(() => bunzip2(Uint8Array.from([1, 2, 3, 4, 5]))).toThrow(Bzip2Error)
  })

  it('detects a flipped bit through the block CRC or the structure', () => {
    const data = bytes(cases.noise!.bz2)
    data[1200] = data[1200]! ^ 0x10
    expect(() => bunzip2(data)).toThrow(Bzip2Error)
  })

  it('refuses a truncated stream', () => {
    expect(() => bunzip2(bytes(cases.text!.bz2).subarray(0, 30))).toThrow(Bzip2Error)
  })
})

describe('decodeVolume on the recorded fixture', () => {
  const file = readFileSync(FIXTURE_PATH)
  const volume = fixtureVolume()

  it('reads the volume header and the radar site', () => {
    expect(volume.icao).toBe('KILN')
    expect(new Date(volume.startMs).toISOString()).toBe('2024-05-07T20:03:03.214Z')
    expect(volume.latitude).toBeCloseTo(39.42, 2)
    expect(volume.longitude).toBeCloseTo(-83.82, 2)
    expect(volume.siteHeightM).toBe(322)
  })

  it('decodes the two sweeps the fixture holds, as sectors', () => {
    expect(volume.sweeps.map((s) => [s.elevationNumber, s.azimuthsDeg.length, s.complete])).toEqual(
      [
        [1, 240, false],
        [2, 240, false],
      ],
    )
    const [first, second] = volume.sweeps
    expect(first!.elevationDeg).toBeCloseTo(0.53, 1)
    expect(Object.keys(first!.moments)).toEqual(['REF', 'ZDR', 'PHI', 'RHO'])
    expect(Object.keys(second!.moments)).toEqual(['REF', 'VEL'])
    expect(first!.azimuthsDeg[0]).toBeCloseTo(9.2, 1)
  })

  it('keeps the radar scale and offset so codes convert to physical values', () => {
    const ref = volume.sweeps[0]!.moments.REF!
    expect([ref.scale, ref.offset, ref.firstGateM, ref.gateSpacingM]).toEqual([2, 66, 2125, 250])
    expect(momentValue(ref, 0)).toBeUndefined()
    expect(momentValue(ref, 1)).toBeUndefined()
    expect(momentValue(ref, 130)).toBe(32)
    let peak = -99
    for (const c of ref.codes) if (c > 1) peak = Math.max(peak, (c - ref.offset) / ref.scale)
    expect(peak).toBe(59)
  })

  it('measures velocities in meters per second', () => {
    const vel = volume.sweeps[1]!.moments.VEL!
    let lo = Infinity
    let hi = -Infinity
    for (const c of vel.codes) {
      const v = momentValue(vel, c)
      if (v === undefined) continue
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
    expect(hi).toBe(28)
    expect(lo).toBeGreaterThan(-40)
  })

  it('can stop after the lowest cut or keep chosen cuts', () => {
    expect(decodeVolume(file, { maxSweeps: 1 }).sweeps).toHaveLength(1)
    expect(decodeVolume(file, { elevations: [2] }).sweeps.map((s) => s.elevationNumber)).toEqual([
      2,
    ])
  })

  it('crops a moment to a compact polar field', () => {
    const field = polarFromSweep(volume.sweeps[0]!, 'REF', { maxRangeKm: 100 })!
    expect(field.gates).toBe(Math.floor((100_000 - 2125) / 250) + 1)
    expect(unpackCodes(field)).toHaveLength(field.azimuthsDeg.length * field.gates)
    const sector = polarFromSweep(volume.sweeps[0]!, 'REF', {
      maxRangeKm: 50,
      sector: { fromDeg: 20, toDeg: 40 },
    })!
    expect(Math.min(...sector.azimuthsDeg)).toBeGreaterThanOrEqual(20)
    expect(Math.max(...sector.azimuthsDeg)).toBeLessThanOrEqual(40)
    expect(polarFromSweep(volume.sweeps[0]!, 'VEL', { maxRangeKm: 50 })).toBeUndefined()
  })

  it('refuses files that are not Archive II or are corrupt', () => {
    expect(() => decodeVolume(Uint8Array.from([1, 2, 3, 4]))).toThrow(Level2Error)
    const bad = Uint8Array.from(file)
    bad[5000] = bad[5000]! ^ 0xff
    expect(() => decodeVolume(bad)).toThrow(Level2Error)
  })

  it('stops cleanly at a record cut off by an HTTP range', () => {
    const cut = decodeVolume(file.subarray(0, 24 + 4 + 3798 + 4 + 266279 + 1000))
    expect(cut.sweeps).toHaveLength(1)
    expect(cut.sweeps[0]!.azimuthsDeg).toHaveLength(120)
  })
})
