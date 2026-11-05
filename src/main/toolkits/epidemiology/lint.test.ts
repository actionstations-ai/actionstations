import { describe, expect, it } from 'vitest'
import { DAY_MS, HOUR_MS } from '@shared/epidemiology/arithmetic'
import {
  checkCountsMatchLineList,
  checkCurveUsesOnset,
  checkExposureWindows,
  type LineListRow,
} from './lint'

const RASH = Date.UTC(2026, 9, 19, 0, 0, 0)

describe('epi_exposure_window', () => {
  const window = (fromDay: number, toDay: number, label = 'Clinic') => ({
    label,
    startMs: RASH + fromDay * DAY_MS,
    endMs: RASH + toDay * DAY_MS,
  })

  it('accepts a window inside the measles infectious period', () => {
    expect(
      checkExposureWindows({ pathogenId: 'measles', onsetMs: RASH, windows: [window(-3, -2)] }),
    ).toEqual([])
  })

  it('flags a window before the infectious period starts', () => {
    const p = checkExposureWindows({
      pathogenId: 'measles',
      onsetMs: RASH,
      windows: [window(-9, -6, 'School')],
    })
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ rule: 'epi_exposure_window', where: 'School' })
    expect(p[0]!.message).toMatch(/does not overlap/)
  })

  it('flags a window that runs past the end', () => {
    const p = checkExposureWindows({
      pathogenId: 'measles',
      onsetMs: RASH,
      windows: [window(3, 6)],
    })
    expect(p[0]!.message).toMatch(/extends outside/)
  })

  it('flags a window that ends before it starts and skips pathogens with no fixed period', () => {
    expect(
      checkExposureWindows({ pathogenId: 'measles', onsetMs: RASH, windows: [window(-1, -2)] })[0]!
        .message,
    ).toMatch(/ends before/)
    expect(
      checkExposureWindows({ pathogenId: 'legionella', onsetMs: RASH, windows: [window(-1, -2)] }),
    ).toEqual([])
  })
})

describe('epi_counts_match_line_list', () => {
  const list: LineListRow[] = [
    ...Array.from({ length: 12 }, (_, i) => ({ id: `C${i}`, status: 'confirmed' as const })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: `P${i}`, status: 'probable' as const })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `S${i}`, status: 'suspect' as const })),
  ]

  it('accepts messages that match the list', () => {
    expect(
      checkCountsMatchLineList(list, [
        {
          source: 'press release',
          text: '12 confirmed and 5 probable cases; 3 suspect under review.',
        },
        { source: 'school letter', text: 'There are 17 cases linked to the event.' },
        { source: 'internal', text: 'The line list holds 20 cases.' },
      ]),
    ).toEqual([])
  })

  it('flags a tier count and a total that differ', () => {
    const p = checkCountsMatchLineList(list, [
      { source: 'press release', text: '14 confirmed cases were reported.' },
      { source: 'school letter', text: 'Eleven families... 19 cases in total.' },
    ])
    expect(p.map((x) => x.where)).toEqual(['press release', 'school letter'])
    expect(p[0]!.message).toContain('line list has 12')
    expect(p[1]!.message).toContain('line list has 20 (17 confirmed or probable)')
  })
})

describe('epi_onset_not_report_date', () => {
  const day0 = Date.UTC(2026, 9, 17, 0, 0, 0)
  const cases = [
    { onsetMs: day0 + 2 * HOUR_MS, reportedMs: day0 + DAY_MS + HOUR_MS },
    { onsetMs: day0 + 5 * HOUR_MS, reportedMs: day0 + DAY_MS + 3 * HOUR_MS },
    { onsetMs: day0 + DAY_MS + HOUR_MS, reportedMs: day0 + 2 * DAY_MS },
  ]

  it('accepts the onset histogram', () => {
    expect(checkCurveUsesOnset({ cases, startMs: day0, binMs: DAY_MS, drawn: [2, 1, 0] })).toEqual(
      [],
    )
  })

  it('names a curve drawn by report date', () => {
    const p = checkCurveUsesOnset({ cases, startMs: day0, binMs: DAY_MS, drawn: [0, 2, 1] })
    expect(p[0]!.message).toMatch(/by report date/)
  })

  it('flags any other mismatch', () => {
    const p = checkCurveUsesOnset({ cases, startMs: day0, binMs: DAY_MS, drawn: [1, 1, 1] })
    expect(p[0]!.message).toMatch(/does not match/)
  })
})
