// The real-UN-number-with-untabled-distances rule (spec 0456 FR-6).
import { describe, expect, it } from 'vitest'
import { ErgTable, ergDistanceUntabled } from './erg-distance-lint'

describe('ergDistanceUntabled', () => {
  it('flags a real UN number with typed distances when no table is loaded', () => {
    const f = ergDistanceUntabled('Isolate 800 meters around the tank car carrying UN1789.')
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ code: 'ERG_DISTANCE_UNTABLED', unNumber: '1789' })
    expect(f[0]!.distances).toEqual(['800 meters'])
  })

  it('accepts a fictional material, an exercise value or a named guidebook edition', () => {
    for (const s of [
      'Exercise material X-17 (UN 9999) isolation 300 ft.',
      'UN1789 isolation of 300 ft is an invented value for the exercise.',
      'UN1789: 300 ft from the ERG 2024 table the facilitator entered.',
      "UN1789 distances come from the facilitator's guidebook: 300 ft.",
    ])
      expect(ergDistanceUntabled(s), s).toEqual([])
  })

  it('ignores a UN number without distances and distances without a UN number', () => {
    expect(ergDistanceUntabled('The placard reads UN1789.')).toEqual([])
    expect(ergDistanceUntabled('Shelter everyone within 0.4 miles.')).toEqual([])
  })

  it('accepts distances that match a loaded table within five percent', () => {
    const table = ErgTable.parse({
      edition: 'Test edition',
      entries: [
        {
          unNumber: '1789',
          guide: '157',
          name: 'Test acid',
          distances: [{ spill: 'small', time: 'day', isolationMeters: 60, protectiveKm: 0.3 }],
        },
      ],
    })
    expect(ergDistanceUntabled('Isolate 60 meters for UN1789.', table)).toEqual([])
    expect(ergDistanceUntabled('Protective action 300 m for UN1789.', table)).toEqual([])
    expect(ergDistanceUntabled('Isolate 500 meters for UN1789.', table)).toHaveLength(1)
  })

  it('validates a data file', () => {
    expect(() =>
      ErgTable.parse({
        edition: 'x',
        entries: [{ unNumber: '12', guide: '1', name: 'n', distances: [] }],
      }),
    ).toThrow()
  })
})
