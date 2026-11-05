import { describe, expect, it } from 'vitest'
import {
  gLevelForKp,
  lintCmeArrival,
  lintIcaoAdvisory,
  lintMessageCode,
  lintProductKind,
  lintScaleMapping,
  lintSwpcIssueTime,
  rLevelForXray,
  sLevelForFlux,
} from './lint'

describe('scale mappings', () => {
  it('maps Kp to G with 9- counted as G4', () => {
    expect([4, 5, 6, 7, 8].map((k) => gLevelForKp(k))).toEqual([0, 1, 2, 3, 4])
    expect(gLevelForKp(9, '-')).toBe(4)
    expect(gLevelForKp(9)).toBe(5)
  })
  it('maps X-ray class to R at the published boundaries', () => {
    expect(rLevelForXray('M', 1)).toBe(1)
    expect(rLevelForXray('M', 4.9)).toBe(1)
    expect(rLevelForXray('M', 5)).toBe(2)
    expect(rLevelForXray('X', 1)).toBe(3)
    expect(rLevelForXray('X', 10)).toBe(4)
    expect(rLevelForXray('X', 20)).toBe(5)
    expect(rLevelForXray('C', 9)).toBe(0)
  })
  it('maps proton flux to S, ten times per level', () => {
    expect([9, 10, 99, 100, 1000, 10000, 100000].map(sLevelForFlux)).toEqual([0, 1, 1, 2, 3, 4, 5])
  })
})

describe('scale claims in text', () => {
  it('accepts matching claims in either order', () => {
    expect(lintScaleMapping('A K-index of 7 (G3, Strong) is expected.')).toEqual([])
    expect(lintScaleMapping('G4 conditions: Kp 8 reached at 2330 UTC.')).toEqual([])
    expect(lintScaleMapping('An X2.1 flare, an R3 radio blackout.')).toEqual([])
    expect(lintScaleMapping('Flux exceeded 1000 pfu, the S3 level.')).toEqual([])
  })
  it('flags a Kp that does not match the stated G level', () => {
    const [issue] = lintScaleMapping('Kp 6 (G3) was observed.')
    expect(issue?.message).toMatch(/Kp 6 is G2, not G3/)
  })
  it('flags an X-ray class or proton flux that does not match R or S', () => {
    expect(lintScaleMapping('An M5 flare caused an R3 blackout.')[0]?.message).toMatch(/R2/)
    expect(lintScaleMapping('A 100 pfu proton event is S3.')[0]?.message).toMatch(/S2/)
  })
  it('does not join claims across a comma, a period or a semicolon', () => {
    expect(lintScaleMapping('Expected G4, Kp 9 is possible later.')).toEqual([])
    expect(lintScaleMapping('Peak was G3. Kp 5 is next.')).toEqual([])
  })
})

describe('message codes, times and kinds', () => {
  it('checks the code shape and that it fits the product kind', () => {
    expect(lintMessageCode('WATA20', 'WATCH')).toEqual([])
    expect(lintMessageCode('WARK07', 'WARNING', 'Geomagnetic K-index of 7 expected')).toEqual([])
    expect(lintMessageCode('WATA20', 'ALERT')[0]?.message).toMatch(/watch code/)
    expect(lintMessageCode('W1', 'WATCH')[0]?.message).toMatch(/not a SWPC message code shape/)
  })
  it('checks that the K digit in the code agrees with the headline', () => {
    expect(lintMessageCode('ALTK06', 'ALERT', 'Geomagnetic K-index of 5')[0]?.message).toMatch(
      /K-index of 6 but the headline says 5/,
    )
  })
  it('requires the issue time in UTC as the products write it', () => {
    expect(lintSwpcIssueTime('2026 Nov 05 1558 UTC')).toEqual([])
    expect(lintSwpcIssueTime('1058 AM EST Thu Nov 5 2026')).toHaveLength(1)
  })
  it('keeps predicted conditions out of alerts and reached ones out of watches', () => {
    expect(lintProductKind('ALERT', 'Geomagnetic K-index of 7 expected')).toHaveLength(1)
    expect(lintProductKind('ALERT', 'Geomagnetic K-index of 7')).toEqual([])
    expect(lintProductKind('WATCH', 'Geomagnetic storm G4 reached')).toHaveLength(1)
    expect(lintProductKind('WATCH', 'Geomagnetic Storm Category G4 Predicted')).toEqual([])
  })
})

describe('CME arrival and ICAO layout', () => {
  it('requires ordered times and a window of at least three hours', () => {
    const ok = {
      earliest: '2026 Nov 06 1200 UTC',
      mostLikely: '2026 Nov 06 2000 UTC',
      latest: '2026 Nov 07 0400 UTC',
    }
    expect(lintCmeArrival(ok)).toEqual([])
    expect(lintCmeArrival({ ...ok, mostLikely: '2026 Nov 08 0000 UTC' })[0]?.message).toMatch(
      /earliest, most likely, latest/,
    )
    expect(
      lintCmeArrival({
        ...ok,
        mostLikely: '2026 Nov 06 1230 UTC',
        latest: '2026 Nov 06 1300 UTC',
      })[0]?.message,
    ).toMatch(/hours/)
  })
  it('checks the fixed ICAO lines', () => {
    const good = {
      dtg: '20261105/1630Z',
      advisoryNumber: '2026/12',
      effect: 'HF COM MOD AND GNSS MOD',
      forecasts: [
        { hours: '+6 HR' },
        { hours: '+12 HR' },
        { hours: '+18 HR' },
        { hours: '+24 HR' },
      ],
    }
    expect(lintIcaoAdvisory(good)).toEqual([])
    const bad = lintIcaoAdvisory({
      dtg: '2026-11-05 16:30',
      advisoryNumber: '12',
      effect: 'HF BLACKOUT',
      forecasts: [{ hours: '+6 HR' }],
    })
    expect(bad).toHaveLength(4)
  })
})
