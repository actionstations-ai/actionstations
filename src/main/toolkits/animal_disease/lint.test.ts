// The pure animal disease checks and the plan rule table (spec 0460 FR-4).
import { describe, expect, it } from 'vitest'
import {
  DESIGNATIONS,
  FMD_PLAN,
  FMD_SAMPLING,
  HPAI_PLAN,
  HPAI_ZONE_MINIMUMS,
  designationChangeAllowed,
  planOf,
} from '@shared/animal-disease/plan-rules'
import {
  ANIMAL_LINT_RULES,
  checkDepopulationWindow,
  checkDesignationChange,
  checkDesignationTerm,
  checkHpaiZoneSizes,
  checkLabSequence,
  checkSamplingInterval,
} from './lint'

describe('plan rules carry their edition', () => {
  it('names the two Red Books with their dates', () => {
    expect(HPAI_PLAN.edition).toBe('May 2017')
    expect(FMD_PLAN.edition).toBe('October 2020')
    expect(planOf('HPAI Red Book (May 2017)')).toBe(HPAI_PLAN)
    expect(planOf('FMD Red Book (October 2020)')).toBe(FMD_PLAN)
    expect(planOf('State plan')).toBeUndefined()
  })

  it('holds the HPAI minimums and FMD sampling table from the plans', () => {
    expect(HPAI_ZONE_MINIMUMS).toEqual({
      infectedZoneKm: 3,
      bufferZoneKm: 7,
      controlAreaKm: 10,
      surveillanceZoneKm: 10,
    })
    expect(FMD_SAMPLING.find((r) => r.designation === 'contact')).toMatchObject({
      intervalDays: 5,
      duration: { days: 14 },
    })
    expect(FMD_SAMPLING.find((r) => r.designation === 'surveillance-zone')?.intervalDays).toBe(21)
  })

  it('lets only an at-risk premises become monitored', () => {
    for (const from of DESIGNATIONS)
      expect(designationChangeAllowed(from, 'monitored')).toBe(from === 'at-risk')
    expect(designationChangeAllowed('free', 'at-risk')).toBe(true)
  })
})

describe('designation checks', () => {
  it('accepts plan words and flags others', () => {
    expect(checkDesignationTerm('d', 'at-risk')).toEqual([])
    expect(checkDesignationTerm('d', 'quarantined')[0]!.message).toMatch(/not a premises/)
  })

  it('flags a monitored premises that was not at-risk', () => {
    expect(checkDesignationChange('contact', 'monitored')[0]!.message).toMatch(/only an at-risk/)
    expect(checkDesignationChange('at-risk', 'monitored')).toEqual([])
    expect(checkDesignationChange('free', 'bogus')).toEqual([])
  })
})

describe('zone sizes', () => {
  it('passes the minimums, including a boundary value', () => {
    expect(
      checkHpaiZoneSizes([
        { kind: 'infected zone', extentKm: 3 },
        { kind: 'buffer zone', extentKm: 7 },
        { kind: 'control area', extentKm: 10 },
        { kind: 'surveillance zone', extentKm: 10 },
        { kind: 'free area', extentKm: 0 },
      ]),
    ).toEqual([])
  })

  it('names each zone under the minimum', () => {
    const out = checkHpaiZoneSizes([
      { kind: 'control area', extentKm: 8 },
      { kind: 'surveillance zone', extentKm: 9.9 },
    ])
    expect(out).toHaveLength(2)
    expect(out[0]!.message).toMatch(/control area is 8 km; the plan minimum is 10 km/)
    expect(out[0]!.message).toMatch(/May 2017/)
  })
})

describe('depopulation window', () => {
  const p = Date.parse('2026-10-21T15:05:00Z')
  const h = (n: number) => p + n * 3_600_000

  it('accepts completion at exactly 24 hours and flags later without a reason', () => {
    expect(checkDepopulationWindow({ presumptiveMs: p, completeMs: h(24) })).toEqual([])
    expect(checkDepopulationWindow({ presumptiveMs: p, completeMs: h(30) })[0]!.message).toMatch(
      /30 hours/,
    )
  })

  it('accepts a later time when the plan states why', () => {
    expect(
      checkDepopulationWindow({
        presumptiveMs: p,
        completeMs: h(30),
        delayReason: 'site opens late',
      }),
    ).toEqual([])
  })
})

describe('sampling interval and laboratory order', () => {
  it('checks FMD intervals by designation', () => {
    expect(checkSamplingInterval('contact', 5)).toEqual([])
    expect(checkSamplingInterval('contact', 7)[0]!.message).toMatch(/every 5 days/)
    expect(checkSamplingInterval('infected', 3)).toEqual([])
  })

  it('puts the presumptive result at a network laboratory and confirmation at the reference laboratory', () => {
    expect(checkLabSequence('presumptive', 'State veterinary diagnostic laboratory')).toEqual([])
    expect(
      checkLabSequence('presumptive', 'National Veterinary Services Laboratories'),
    ).toHaveLength(1)
    expect(checkLabSequence('confirmed', 'State veterinary diagnostic laboratory')).toHaveLength(1)
    expect(checkLabSequence('confirmed', 'National reference laboratory (NVSL)')).toEqual([])
  })

  it('lists the six rules the toolkit names', () => {
    expect([...ANIMAL_LINT_RULES]).toHaveLength(6)
  })
})
